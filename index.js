/**
 * MiniMax image generation — Host half.
 *
 * Owns three things:
 *  1. two model-facing tools, admitted only for conversations the user switched
 *     on in the composer dropdown: `generate_image` (text to image) and
 *     `edit_image` (reference-image editing);
 *  2. the per-conversation switch set (off by default), persisted under
 *     $DSH_HOME so a resumed conversation keeps its choice;
 *  3. a small HTTP surface the browser half reads and writes: the switch, and
 *     the endpoint/model/API-key settings page.
 *
 * The model picks the aspect ratio and the area tier per call; the settings
 * page only owns the connection. Settings live in the plugin's own JSON
 * document next to the switch set, so a save takes effect immediately instead
 * of restarting the plugin. The API key lives in the credential store as a
 * credential reference, never in that file.
 */

import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, isAbsolute, join } from 'node:path'

/** Services this plugin requires; optional ones are read with `ctx.get`. */
export const inject = ['tools', 'webServer']

/** Tool names the model sees. */
const GENERATE_TOOL = 'generate_image'
const EDIT_TOOL = 'edit_image'
/** Route prefix owned by this plugin (kept out of the `/api` bridge). */
const ROUTE_PATH = '/plugin/minimax-image'
/** Aspect ratios MiniMax H3 accepts (`auto` lets prompt enhancement decide). */
const ASPECT_RATIOS = ['auto', '1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16']
/** Area tiers: the server derives exact width and height from the ratio. */
const AREAS = ['1K', '2K', '4K']
/** Fallbacks used only when the model omits a value. */
const FALLBACK_AREA = '2K'
/** Request bodies here are a few short fields. */
const MAX_BODY_BYTES = 64 * 1024
/** MiniMax limits: one reference file ≤ 64 MiB, the whole edit request ≤ 64 MiB. */
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
const MAX_REFERENCE_TOTAL_BYTES = 45 * 1024 * 1024

/** Defaults; the plugin row's own config overrides them at activation. */
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.minimaxi.com',
  model: 'MiniMax-H3-Image',
  apiKeyEnv: 'MINIMAX_IMAGE_API_KEY',
}

/** Directory holding this plugin's state under the harness home. */
function stateDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'minimax-image')
}

/** Strip trailing slashes and an optional `/v1` suffix so one base URL form works. */
function normalizeBaseUrl(value) {
  const text = String(value ?? DEFAULT_CONFIG.baseUrl).trim() || DEFAULT_CONFIG.baseUrl
  return text.replace(/\/+$/u, '').replace(/\/v1$/u, '')
}

/** Normalize one settings object against the defaults and accepted values. */
function normalizeSettings(raw, fallback) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const base = fallback ?? DEFAULT_CONFIG
  const model = String(source.model ?? base.model).trim() || base.model
  const apiKeyEnv = String(source.apiKeyEnv ?? base.apiKeyEnv).trim() || base.apiKeyEnv
  return {
    baseUrl: normalizeBaseUrl(source.baseUrl ?? base.baseUrl),
    model,
    apiKeyEnv,
  }
}

/** Sniff an image media type from magic bytes; H3 returns JPEG by default. */
function mediaTypeOf(bytes) {
  if (bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp'
  return undefined
}

/** Media type of one reference image: magic bytes first, then HEIC-family extensions. */
function referenceMediaType(path, bytes) {
  const sniffed = mediaTypeOf(bytes)
  if (sniffed !== undefined) return sniffed
  const extension = extname(path).toLowerCase()
  if (extension === '.heic') return 'image/heic'
  if (extension === '.heif') return 'image/heif'
  throw new Error(`cannot tell the image type of ${path}; use PNG, JPEG, WebP, HEIC, or HEIF`)
}

/** File extension for one media type. */
function extensionOf(mediaType) {
  if (mediaType === 'image/png') return '.png'
  if (mediaType === 'image/webp') return '.webp'
  return '.jpeg'
}

/** Parse the `宽x高` string H3 reports for each generated image. */
function dimensionsOf(size) {
  if (typeof size !== 'string') return undefined
  const match = /^(\d+)\s*[x×]\s*(\d+)$/u.exec(size.trim())
  if (match === null) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** Read one request body with a hard byte cap. */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Reply with JSON and never throw out of a route handler. */
function sendJson(res, status, payload) {
  if (res.writableEnded) return
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/** Read one JSON document, or undefined when it is missing or unreadable. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** Write one JSON document, creating its directory first. */
async function writeJson(path, value) {
  await mkdir(stateDir(), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/**
 * Register both tools, the settings routes, and the per-conversation switch.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} rowConfig
 */
export function apply(ctx, rowConfig) {
  const switchesFile = join(stateDir(), 'sessions.json')
  const settingsFile = join(stateDir(), 'settings.json')

  /** Conversations that allow image generation; loaded once. */
  const enabled = new Set()
  let switchesReady = null
  const loadSwitches = () => {
    switchesReady ??= readJson(switchesFile).then((document) => {
      const ids = Array.isArray(document?.enabled) ? document.enabled : []
      for (const id of ids) if (typeof id === 'string') enabled.add(id)
    })
    return switchesReady
  }

  /** Effective settings: the saved document over the row config and defaults. */
  let saved = null
  let settingsReady = null
  const loadSettings = () => {
    settingsReady ??= readJson(settingsFile).then((document) => {
      saved = normalizeSettings(document, normalizeSettings(rowConfig))
    })
    return settingsReady
  }
  const settings = () => saved ?? normalizeSettings(rowConfig)

  // Prime both documents at activation so a resumed conversation is already
  // admitted when the first step resolves its tools.
  void loadSwitches()
  void loadSettings()

  /** Persist one conversation's choice. */
  const setEnabled = async (sessionId, on) => {
    if (on) enabled.add(sessionId)
    else enabled.delete(sessionId)
    await writeJson(switchesFile, { version: 1, enabled: [...enabled] })
  }

  /**
   * Read the API key: credential reference first, then the process environment.
   * @param {{ apiKeyEnv: string }} config
   * @returns {Promise<string | undefined>}
   */
  const resolveApiKey = async (config) => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const hit = await credentials.resolve(config.apiKeyEnv)
        if (hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0) return hit.value
      } catch {
        // Fall through to the environment.
      }
    }
    const fromEnv = process.env[config.apiKeyEnv]
    return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : undefined
  }

  /** Whether a key is stored, without reading its value. */
  const describeApiKey = async (config) => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const info = await credentials.describe(config.apiKeyEnv)
        if (info?.configured === true) return { configured: true, writable: info.writable !== false }
      } catch {
        // Treat an unavailable store as "not configured" rather than failing the page.
      }
    }
    const fromEnv = process.env[config.apiKeyEnv]
    return { configured: fromEnv !== undefined && fromEnv.length > 0, writable: true }
  }

  /** One settings snapshot for the settings page. */
  const describe = async () => {
    await loadSettings()
    const config = settings()
    const key = await describeApiKey(config)
    return { config, hasKey: key.configured, keyWritable: key.writable }
  }

  /**
   * Turn one user-supplied reference into something the edits endpoint takes:
   * an http(s) URL passes through, a local file becomes a data URI.
   * @param {string} source - absolute path, http(s) URL, or data URI.
   * @param {{ total: number }} budget - running encoded-byte budget.
   */
  const referenceImage = async (source, budget) => {
    const value = String(source).trim()
    if (/^data:/iu.test(value)) return value
    if (/^https?:\/\//iu.test(value)) return value
    if (!isAbsolute(value)) {
      throw new Error(`reference image "${value}" is not an absolute path or an http(s) URL`)
    }
    const bytes = await readFile(value)
    if (bytes.length > MAX_REFERENCE_BYTES) {
      throw new Error(`reference image ${value} is ${Math.round(bytes.length / 1024 / 1024)} MB; the per-image limit is ${MAX_REFERENCE_BYTES / 1024 / 1024} MB (pass an http(s) URL for larger files)`)
    }
    budget.total += Math.ceil(bytes.length * 4 / 3)
    if (budget.total > MAX_REFERENCE_TOTAL_BYTES) {
      throw new Error(`the reference images exceed the ${MAX_REFERENCE_TOTAL_BYTES / 1024 / 1024} MB request budget; pass fewer images or http(s) URLs`)
    }
    const mediaType = referenceMediaType(value, bytes)
    return `data:${mediaType};base64,${bytes.toString('base64')}`
  }

  /**
   * One MiniMax call. Returns the successful items plus any per-image failures
   * the service reported beside them (a partial success is still HTTP 200).
   */
  const requestImages = async (config, apiKey, args, signal) => {
    const url = `${config.baseUrl}${args.path}`
    const aspectRatio = args.aspectRatio ?? 'auto'
    const body = {
      model: config.model,
      prompt: args.prompt,
      n: args.count,
      response_format: 'url',
      area: args.area ?? FALLBACK_AREA,
      ...(aspectRatio === 'auto' ? {} : { aspect_ratio: aspectRatio }),
      ...(args.images === undefined ? {} : { images: args.images }),
    }
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      throw new Error(`cannot reach ${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`MiniMax returned a non-JSON response (HTTP ${response.status})`)
    }

    const items = Array.isArray(payload?.data) ? payload.data : []
    const successes = []
    const failures = []
    for (const item of items) {
      if (item?.error !== undefined && item?.error !== null) {
        failures.push({
          code: String(item.error.code ?? ''),
          message: String(item.error.message ?? 'the image failed'),
        })
      } else if (typeof item?.url === 'string' && item.url.length > 0) {
        successes.push({
          url: item.url,
          size: typeof item.size === 'string' ? item.size : undefined,
          revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined,
        })
      }
    }

    if (successes.length === 0) {
      const apiMessage = payload?.error?.message
        ?? payload?.base_resp?.status_msg
        ?? failures.map(failure => failure.message).filter(Boolean).join('; ')
      throw new Error(`MiniMax produced no image: ${apiMessage || `HTTP ${response.status}`}`)
    }
    return {
      successes,
      failures,
      outputFormat: typeof payload.output_format === 'string' ? payload.output_format : undefined,
    }
  }

  /** Download one generated image into the conversation workspace. */
  const saveImage = async (item, workspace, index, outputFormat, prefix, signal) => {
    const response = await fetch(item.url, { signal })
    if (!response.ok) throw new Error(`cannot download the generated image (HTTP ${response.status})`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const mediaType = mediaTypeOf(bytes) ?? 'image/jpeg'
    const extension = outputFormat !== undefined
      ? `.${outputFormat.replace(/^jpg$/u, 'jpeg')}`
      : extensionOf(mediaType)
    const dir = join(workspace, 'generated-images')
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..*$/u, '')
    const path = join(dir, `${prefix}-${stamp}-${index + 1}${extension}`)
    await writeFile(path, bytes)
    return { path, bytes: bytes.length, mediaType, ...(dimensionsOf(item.size) ?? {}) }
  }

  /** Shared tail of both tools: resolve settings, call, save, summarize. */
  const run = async (args, exec, options) => {
    const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
    if (prompt.length === 0) throw new Error('prompt is required')
    const sessionId = exec.agent?.session?.id
    if (typeof sessionId !== 'string') throw new Error('image generation needs a conversation session')
    await loadSwitches()
    await loadSettings()
    if (!enabled.has(sessionId)) {
      throw new Error('image generation is not allowed in this conversation; the user can enable it in the composer dropdown')
    }
    const config = settings()
    const apiKey = await resolveApiKey(config)
    if (apiKey === undefined) {
      throw new Error(`no MiniMax API key is configured (${config.apiKeyEnv}); the user can save one on the MiniMax image generation settings page`)
    }

    let images
    if (options.references !== undefined) {
      const sources = Array.isArray(args?.images) ? args.images.filter(entry => typeof entry === 'string' && entry.trim().length > 0) : []
      if (sources.length === 0) throw new Error('edit_image needs at least one reference image in "images"')
      if (sources.length > 16) throw new Error('edit_image accepts at most 16 reference images')
      const budget = { total: 0 }
      images = []
      for (const source of sources) images.push({ image_url: await referenceImage(source, budget) })
    }

    const requested = Number.isInteger(args?.count) ? args.count : 1
    const count = Math.min(10, Math.max(1, requested))
    const aspectRatio = ASPECT_RATIOS.includes(args?.aspect_ratio) ? args.aspect_ratio : undefined
    const area = AREAS.includes(String(args?.area).toUpperCase()) ? String(args.area).toUpperCase() : undefined
    const workspace = ctx.get('workingDirectory')?.get(exec.agent.session)
      ?? exec.agent.session.header.cwd
      ?? process.cwd()

    const result = await requestImages(config, apiKey, {
      path: options.path, prompt, count, aspectRatio, area, images,
    }, exec.signal)
    const files = []
    for (const [index, item] of result.successes.entries()) {
      files.push(await saveImage(item, workspace, index, result.outputFormat, options.prefix, exec.signal))
    }
    return {
      mode: options.mode,
      model: config.model,
      prompt,
      files,
      failures: result.failures,
      ...(result.successes[0]?.revisedPrompt === undefined ? {} : { revisedPrompt: result.successes[0].revisedPrompt }),
    }
  }

  /** Model-facing rendering shared by both tools. */
  const renderResult = (value) => {
    const files = Array.isArray(value?.files) ? value.files : []
    const failures = Array.isArray(value?.failures) ? value.failures : []
    const verb = value?.mode === 'edit' ? 'Edited' : 'Generated'
    const lines = [
      `${verb} ${files.length} image${files.length === 1 ? '' : 's'} with ${value?.model ?? 'MiniMax H3'}:`,
      ...files.map((file) => {
        const size = file.width !== undefined && file.height !== undefined ? ` (${file.width}x${file.height})` : ''
        return `- ${file.path}${size}`
      }),
    ]
    if (failures.length > 0) {
      lines.push(`${failures.length} image${failures.length === 1 ? '' : 's'} failed: ${failures.map(failure => failure.message).join('; ')}`)
    }
    lines.push('Call read_image on one of these paths to show the image inline.')
    return [{ type: 'text', text: lines.join('\n') }]
  }

  /** Parameters shared by the two tools. */
  const sharedParameters = {
    prompt: {
      type: 'string',
      description: 'What the image should show. Be concrete about subject, style, lighting, and composition.',
    },
    aspect_ratio: {
      type: 'string',
      enum: ASPECT_RATIOS,
      description: 'Output aspect ratio chosen for this request. Use auto to let MiniMax decide from the prompt; otherwise pick the shape the picture needs.',
    },
    area: {
      type: 'string',
      enum: AREAS,
      description: 'Target pixel area: 1K (~1024²), 2K (~2048²), or 4K (~4096²). Pick according to how much detail the image needs.',
    },
    count: {
      type: 'integer',
      description: 'How many images to generate (1-10). Defaults to 1.',
    },
  }

  const sharedOutput = {
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        model: { type: 'string' },
        prompt: { type: 'string' },
        files: { type: 'array', items: { type: 'object', additionalProperties: true } },
        failures: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
    render: (_args, value) => renderResult(value),
  }

  const generateTool = {
    name: GENERATE_TOOL,
    description: 'Generate an image from a text prompt with MiniMax H3. '
      + 'Only available while the user has allowed image generation for this conversation. '
      + 'You choose the aspect ratio and the area tier for each call. '
      + 'The generated file is saved into the workspace; call read_image on the returned path to show it to the user.',
    parameters: { type: 'object', properties: sharedParameters, required: ['prompt'], additionalProperties: false },
    output: sharedOutput,
    execute(args, exec) {
      return run(args, exec, { path: '/v1/images/generations', prefix: 'minimax', mode: 'generate' })
    },
  }

  const editTool = {
    name: EDIT_TOOL,
    description: 'Edit or combine 1-16 reference images with a text instruction using MiniMax H3. '
      + 'Only available while the user has allowed image generation for this conversation. '
      + 'Reference pictures go in "images" as absolute local paths (for example a generated image or an attached file) or http(s) URLs; '
      + 'the instruction names them as 图1, 图2, ... in the order given. '
      + 'You choose the aspect ratio and the area tier for each call. '
      + 'The edited file is saved into the workspace; call read_image on the returned path to show it to the user.',
    parameters: {
      type: 'object',
      properties: {
        ...sharedParameters,
        images: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reference images in order: absolute local paths or http(s) URLs. The first is 图1.',
        },
      },
      required: ['prompt', 'images'],
      additionalProperties: false,
    },
    output: sharedOutput,
    execute(args, exec) {
      return run(args, exec, { path: '/v1/images/edits', prefix: 'minimax-edit', mode: 'edit', references: true })
    },
  }

  // Both tools ride one gate: the conversation's switch. The condition is
  // evaluated per model step, so flipping the dropdown applies to the next step.
  ctx.effect(() => {
    const disposeGenerate = ctx.tools.register(generateTool, {
      when: async ({ agent }) => {
        const sessionId = agent?.session?.id
        if (typeof sessionId !== 'string') return false
        await loadSwitches()
        return enabled.has(sessionId)
      },
    })
    const disposeEdit = ctx.tools.register(editTool, {
      when: async ({ agent }) => {
        const sessionId = agent?.session?.id
        if (typeof sessionId !== 'string') return false
        await loadSwitches()
        return enabled.has(sessionId)
      },
    })
    return () => { disposeGenerate(); disposeEdit() }
  }, 'minimax-image: generate_image and edit_image tools')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const route = url.pathname.slice(ROUTE_PATH.length).replace(/\/+$/u, '') || '/'
        if (route === '/config' && req.method === 'GET') {
          sendJson(res, 200, await describe())
          return
        }
        if (route === '/config' && req.method === 'POST') {
          const body = await readBody(req)
          await loadSettings()
          const before = await describe()
          const next = normalizeSettings({
            baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : before.config.baseUrl,
            model: typeof body.model === 'string' ? body.model : before.config.model,
            apiKeyEnv: typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : before.config.apiKeyEnv,
          }, before.config)
          const suppliedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
          const credentials = ctx.get('credentials')
          if (suppliedKey.length > 0) {
            if (credentials === undefined) throw new Error('this profile has no credential store')
            await credentials.set(next.apiKeyEnv, suppliedKey)
          } else if (body.clearApiKey === true) {
            if (credentials === undefined) throw new Error('this profile has no credential store')
            await credentials.unset(next.apiKeyEnv)
          }
          saved = next
          await writeJson(settingsFile, { version: 3, ...next })
          const hasKey = suppliedKey.length > 0
            ? true
            : body.clearApiKey === true ? false : before.hasKey
          sendJson(res, 200, { config: next, hasKey, keyWritable: true })
          return
        }
        if (route === '/state' && req.method === 'GET') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          await loadSwitches()
          const described = await describe()
          sendJson(res, 200, {
            sessionId,
            enabled: sessionId.length > 0 && enabled.has(sessionId),
            configured: described.hasKey,
            model: described.config.model,
          })
          return
        }
        if (route === '/state' && req.method === 'POST') {
          const body = await readBody(req)
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          if (sessionId.length === 0) {
            sendJson(res, 400, { error: 'sessionId is required' })
            return
          }
          await loadSwitches()
          await setEnabled(sessionId, body.enabled === true)
          sendJson(res, 200, { sessionId, enabled: enabled.has(sessionId) })
          return
        }
        sendJson(res, 404, { error: 'unknown route' })
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), `minimax-image: HTTP ${ROUTE_PATH}`)

  // The prompt playbook ships as data next to the plugin and is registered as a
  // model-invocable skill, so profiles without a skill registry still get the
  // tools and simply skip this section.
  const skills = ctx.get('skills')
  if (skills !== undefined) {
    try {
      const raw = readFileSync(new URL('./skills/minimax-image-prompting.md', import.meta.url), 'utf8')
      // The file keeps filesystem-skill frontmatter so it still works if copied
      // into a skills directory; the registry wants the instruction body only.
      const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart()
      ctx.effect(() => skills.register({
        name: 'minimax-image-prompting',
        description: 'Write MiniMax H3 image prompts and run an image session: interview the user for the missing style decisions, lock one art direction across a series, pick aspect ratio and area, edit by naming what changes and what stays, and fix weak results one lever at a time.',
        whenToUse: 'Use whenever the user asks for an image, illustration, poster, product shot, character, or wallpaper, or asks to change an existing picture, including requests with no style direction.',
        source: 'bundled',
        content,
      }), 'minimax-image: prompt skill')
    } catch {
      // A missing playbook must not take the tools down with it.
    }
  }
}
