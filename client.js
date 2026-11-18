/**
 * MiniMax image generation — Web Client half.
 *
 * Registers two surfaces:
 *  - a compact dropdown in the composer tool row that decides whether THIS
 *    conversation may generate images (off by default, host-persisted);
 *  - a Settings page for the endpoint, model, aspect ratio, and API key.
 *
 * Both talk to the Host through the plugin's own `/plugin/minimax-image`
 * route; no Harness Client package is imported, only `react` from the module
 * table.
 */

window.__ModuleLoader__.load({
  id: 'minimax-image',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'minimax-image'
    const BASE = '/plugin/minimax-image'
    /** Broadcast after a settings save so an already-mounted chip re-reads its state. */
    const CONFIG_CHANGED = 'minimax-image/config-changed'

    /**
     * Composer glyphs copied from the product icon set (ui-primitives
     * `ICON_ARTWORK`): the regular weight is a 1px stroke on a 16px viewBox,
     * which is what the neighbouring permission chip renders at 14px.
     */
    const CHIP_ICON = h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true },
      h('path', { d: 'M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z' }),
      h('path', { d: 'M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z' }),
      h('path', { d: 'M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z' }))

    /** The same chevron artwork the permission chip uses (`chevron-down-outline`). */
    const CHIP_CHEVRON = h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true },
      h('path', { d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6' }))

    /** Selected-row marker, copied from the same set (`check-outline`). */
    const CHECK_ICON = h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true },
      h('path', { d: 'M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4' }))

    /** Menu geometry: two 34px rows plus the card padding, 4px above the trigger. */
    const MENU_GAP = 4
    const MENU_MARGIN = 12
    const MENU_WIDTH = 160
    const MENU_HEIGHT = 76

    const DICTIONARIES = {
      zh: {
        'chip.label': '生图',
        'chip.sep': '：',
        'chip.off': '不允许',
        'chip.on': '允许',
        'chip.hint': '本次对话是否允许模型调用 MiniMax 生图',
        'chip.noKey': '尚未保存 API Key，保存后才能生图',
        'chip.saveFailed': '切换失败，请重试',
        'chip.unreachable': '生图服务尚未就绪，重启 DeepSeek Harness 后可用',
        'settings.title': 'MiniMax 生图',
        'settings.intro': '这里只配置接口；画面比例和面积档位由模型在每次调用时自己决定。输入框里的下拉框控制本次对话是否允许生图。',
        'settings.baseUrl': '接口地址',
        'settings.baseUrlHint': '默认为 https://api.minimaxi.com，插件会自动补上 /v1/images/generations 或 /v1/images/edits。',
        'settings.model': '模型',
        'settings.modelHint': 'MiniMax-H3-Image，或高速版 MiniMax-H3-Image-Highspeed。',
        'settings.apiKey': 'API Key',
        'settings.apiKeySet': '已保存。留空保持不变。',
        'settings.apiKeyMissing': '尚未保存。',
        'settings.apiKeyPlaceholder': 'sk-api-…',
        'settings.clear': '清除密钥',
        'settings.readOnlyKey': '当前凭据库不允许从界面写入密钥。',
        'settings.save': '保存',
        'settings.saving': '保存中…',
        'settings.saved': '已保存',
        'settings.note': '密钥保存在本机凭据库（MINIMAX_IMAGE_API_KEY），不会写进插件配置。',
        'settings.loadFailed': '读取设置失败',
        'settings.loadRetry': '重试',
        'settings.saveFailed': '保存失败',
        'settings.loading': '正在读取设置…'
      },
      en: {
        'chip.label': 'Image',
        'chip.sep': ': ',
        'chip.off': 'Off',
        'chip.on': 'On',
        'chip.hint': 'Whether this conversation may call MiniMax image generation',
        'chip.noKey': 'No API key saved yet; generation stays unavailable until one is',
        'chip.saveFailed': 'Could not switch; try again',
        'chip.unreachable': 'Image generation is not ready yet; restart DeepSeek Harness to activate it',
        'settings.title': 'MiniMax image generation',
        'settings.intro': 'This page only configures the connection; the model picks the aspect ratio and area tier for each call. The composer dropdown decides whether a conversation may generate images.',
        'settings.baseUrl': 'Endpoint',
        'settings.baseUrlHint': 'Defaults to https://api.minimaxi.com; the plugin appends /v1/images/generations or /v1/images/edits.',
        'settings.model': 'Model',
        'settings.modelHint': 'MiniMax-H3-Image, or the faster MiniMax-H3-Image-Highspeed.',
        'settings.apiKey': 'API key',
        'settings.apiKeySet': 'Saved. Leave empty to keep it.',
        'settings.apiKeyMissing': 'Not saved yet.',
        'settings.apiKeyPlaceholder': 'sk-api-…',
        'settings.clear': 'Clear key',
        'settings.readOnlyKey': 'This credential store does not allow writing a key from the app.',
        'settings.save': 'Save',
        'settings.saving': 'Saving…',
        'settings.saved': 'Saved',
        'settings.note': 'The key is stored in this machine\'s credential store (MINIMAX_IMAGE_API_KEY), never in plugin configuration.',
        'settings.loadFailed': 'Could not read settings',
        'settings.loadRetry': 'Retry',
        'settings.saveFailed': 'Save failed',
        'settings.loading': 'Reading settings…'
      }
    }

    const CSS = `
.mimg-chip{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;margin:0;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
@media (hover:hover){.mimg-chip:hover:not([data-disabled=true]):not([data-open=true]){background:var(--dsw-alias-interactive-bg-hover)}}
.mimg-chip[data-open=true]{background:var(--dsw-alias-interactive-bg-hover)}
.mimg-chip:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))}
.mimg-chip[data-disabled=true]{color:var(--dsw-alias-label-dimmed);cursor:default}
.mimg-chip[data-warn=true] .mimg-chip-icon{color:var(--dsw-alias-state-warn-primary)}
.mimg-chip[data-error=true] .mimg-chip-icon{color:var(--dsw-alias-state-error-primary)}
.mimg-chip-icon{display:inline-flex;flex:0 0 auto}
.mimg-chip-icon svg{width:14px;height:14px}
.mimg-chip-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mimg-chevron{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.mimg-chip[data-open=true] .mimg-chevron{transform:rotate(180deg)}
/* Same narrow-composer collapse as the permission chip: the label drops,
   the glyph and chevron stay. */
@container (max-width:460px){.mimg-chip:has(.mimg-chip-icon) .mimg-chip-label{display:none}}
/* Menu card and rows copied from the shipped Menu surface (ui-primitives):
   same translucent fill, elevation, 4px card padding, and 34px rows. */
.mimg-menu{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;padding:4px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);animation:mimg-menu-in 120ms ease-out}
@keyframes mimg-menu-in{from{opacity:0}to{opacity:1}}
.mimg-menu-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
@media (hover:hover){.mimg-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.mimg-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.mimg-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mimg-menu-check{display:inline-flex;flex:none;color:var(--dsw-alias-label-primary)}
.mimg-menu-check svg{width:14px;height:14px}
.mimg-page{display:block;padding:4px 0 24px;color:var(--dsw-alias-label-primary);max-width:640px}
.mimg-page h2{margin:0 0 6px;font-size:15px;font-weight:600}
.mimg-intro{margin:0 0 18px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.mimg-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-module-platform)}
.mimg-field{display:block;margin:0 0 14px}
.mimg-field:last-of-type{margin-bottom:0}
.mimg-label{display:block;font-size:13px;font-weight:500;margin-bottom:6px}
.mimg-input{display:block;width:100%;box-sizing:border-box;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.mimg-input:focus{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))}
.mimg-input:disabled{opacity:.6;cursor:default}
.mimg-hint{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.mimg-row{display:flex;align-items:flex-end;gap:8px}
.mimg-row .mimg-field{flex:1;margin-bottom:0}
.mimg-status-line{font-size:12px;color:var(--dsw-alias-label-secondary)}
.mimg-status-line.is-set{color:var(--dsw-alias-state-success-primary)}
.mimg-actions{display:flex;align-items:center;gap:10px;margin-top:18px}
.mimg-button{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.mimg-button:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.mimg-button:disabled{opacity:.55;cursor:default}
.mimg-button:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))}
.mimg-button.is-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-bg-base)}
.mimg-button.is-primary:hover{background:var(--dsw-alias-button-primary-hover)}
.mimg-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}
.mimg-alert{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary);font-size:13px;background:var(--dsw-alias-bg-module-platform)}
.mimg-foot{margin:14px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
`

    /** Call one plugin route and surface its JSON error message. */
    async function request(path, init) {
      const response = await fetch(`${BASE}${path}`, init)
      const text = await response.text()
      let payload = {}
      if (text.length > 0) {
        try {
          payload = JSON.parse(text)
        } catch {
          payload = {}
        }
      }
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      return payload
    }

    /** The composer dropdown: one conversation's image-generation permission. */
    function ImageChip(props) {
      const { sessionId, t } = props
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [failure, setFailure] = React.useState(false)
      const [reachable, setReachable] = React.useState(true)
      const [open, setOpen] = React.useState(false)
      const [placement, setPlacement] = React.useState(null)
      const triggerRef = React.useRef(null)
      const menuRef = React.useRef(null)

      const load = React.useCallback(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
        let live = true
        request(`/state?sessionId=${encodeURIComponent(sessionId)}`)
          .then((next) => { if (live) { setState(next); setReachable(true) } })
          .catch(() => { if (live) setReachable(false) })
        return () => { live = false }
      }, [sessionId])

      React.useEffect(load, [load])

      // A settings save can store the first API key; refresh the "configured"
      // flag without remounting the composer.
      React.useEffect(() => {
        const onChange = () => { load() }
        window.addEventListener(CONFIG_CHANGED, onChange)
        return () => { window.removeEventListener(CONFIG_CHANGED, onChange) }
      }, [load])

      const enabled = state?.enabled === true
      const configured = state?.configured !== false
      const disabled = busy || !reachable || state === null
      const title = [
        t('chip.hint'),
        reachable ? null : t('chip.unreachable'),
        reachable && state !== null && !configured ? t('chip.noKey') : null,
        failure ? t('chip.saveFailed') : null,
      ].filter(part => part !== null).join(' · ')

      const close = React.useCallback((restoreFocus) => {
        setOpen(false)
        setPlacement(null)
        if (restoreFocus) triggerRef.current?.focus()
      }, [])

      /** Place the card above the trigger, clamped to the layout viewport. */
      const place = React.useCallback(() => {
        const trigger = triggerRef.current
        if (trigger === null) return null
        const rect = trigger.getBoundingClientRect()
        const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2)
        const left = Math.min(Math.max(MENU_MARGIN, rect.left), window.innerWidth - width - MENU_MARGIN)
        let top = rect.top - MENU_HEIGHT - MENU_GAP
        if (top < MENU_MARGIN) top = rect.bottom + MENU_GAP
        top = Math.min(top, window.innerHeight - MENU_HEIGHT - MENU_MARGIN)
        return { left, top, width }
      }, [])

      const openMenu = () => {
        if (disabled) return
        const next = place()
        if (next === null) return
        setPlacement(next)
        setOpen(true)
      }

      // Focus the current row on open, follow pointer-driven dismissal and
      // layout changes, and leave nothing behind on unmount.
      React.useEffect(() => {
        if (!open) return undefined
        const menu = menuRef.current
        const current = menu?.querySelector('[aria-checked="true"]') ?? menu?.querySelector('[role="menuitemradio"]')
        current?.focus()
        const onPointerDown = (event) => {
          if (menuRef.current?.contains(event.target) === true) return
          if (triggerRef.current?.contains(event.target) === true) return
          close(false)
        }
        const reposition = () => {
          const next = place()
          if (next !== null) setPlacement(next)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          window.removeEventListener('resize', reposition)
          window.removeEventListener('scroll', reposition, true)
        }
      }, [open, close, place])

      const apply = async (next) => {
        setBusy(true)
        setFailure(false)
        try {
          const result = await request('/state', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, enabled: next }),
          })
          setState(current => ({ ...(current ?? {}), ...result }))
        } catch {
          setFailure(true)
          window.setTimeout(() => { setFailure(false) }, 2400)
        }
        setBusy(false)
      }

      const pick = (next) => {
        close(true)
        if (next !== enabled) void apply(next)
      }

      const onMenuKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close(true)
          return
        }
        if (event.key === 'Tab') {
          close(false)
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const rows = [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') ?? [])]
        if (rows.length === 0) return
        const index = rows.indexOf(document.activeElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next = index < 0
          ? (step > 0 ? 0 : rows.length - 1)
          : (index + step + rows.length) % rows.length
        rows[next]?.focus()
      }

      const options = [
        { value: false, label: t('chip.off') },
        { value: true, label: t('chip.on') },
      ]

      // Portaled to the body: the docked composer is the containing block for
      // fixed descendants, so an in-place card would be clipped or misplaced.
      const menu = open && placement !== null
        ? ReactDOM.createPortal(h('div', {
          className: 'mimg-menu',
          role: 'menu',
          ref: menuRef,
          'aria-label': t('chip.hint'),
          style: { left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px` },
          onKeyDown: onMenuKeyDown,
        }, options.map(option => h('button', {
          key: String(option.value),
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': option.value === enabled ? 'true' : 'false',
          className: 'mimg-menu-item',
          onClick: () => { pick(option.value) },
        },
        h('span', { className: 'mimg-menu-label' }, option.label),
        option.value === enabled ? h('span', { className: 'mimg-menu-check', 'aria-hidden': true }, CHECK_ICON) : null))),
        document.body)
        : null

      const label = `${t('chip.label')}${t('chip.sep')}${enabled ? t('chip.on') : t('chip.off')}`

      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'mimg-chip',
          title,
          'data-disabled': disabled ? 'true' : 'false',
          'data-warn': state !== null && !configured ? 'true' : 'false',
          'data-error': failure ? 'true' : 'false',
          'data-open': open ? 'true' : 'false',
          disabled,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t('chip.hint'),
          onClick: () => { if (open) close(false); else openMenu() },
        },
        h('span', { className: 'mimg-chip-icon', 'aria-hidden': true }, CHIP_ICON),
        h('span', { className: 'mimg-chip-label' }, label),
        h('span', { className: 'mimg-chevron', 'aria-hidden': true }, CHIP_CHEVRON)),
        menu)
    }

    /** The Settings page: endpoint, model, aspect ratio, and API key. */
    function ImageSettings(props) {
      const { t } = props
      const [loaded, setLoaded] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [draft, setDraft] = React.useState({ baseUrl: '', model: '', apiKey: '' })

      const adopt = (snapshot) => {
        setLoaded(snapshot)
        setDraft(current => ({
          baseUrl: snapshot.config?.baseUrl ?? '',
          model: snapshot.config?.model ?? '',
          apiKey: current.apiKey,
        }))
      }

      const load = React.useCallback(() => {
        let live = true
        setLoading(true)
        setError(null)
        request('/config')
          .then((snapshot) => { if (live) adopt(snapshot) })
          .catch((failure) => { if (live) setError(failure instanceof Error ? failure.message : String(failure)) })
          .finally(() => { if (live) setLoading(false) })
        return () => { live = false }
      }, [])

      React.useEffect(load, [load])

      const edit = (field) => (event) => {
        const value = event.target.value
        setDraft(current => ({ ...current, [field]: value }))
        setNotice(null)
      }

      const submit = async (body) => {
        setSaving(true)
        setError(null)
        setNotice(null)
        try {
          const snapshot = await request('/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          adopt(snapshot)
          setDraft(current => ({ ...current, apiKey: '' }))
          setNotice(t('settings.saved'))
          window.dispatchEvent(new CustomEvent(CONFIG_CHANGED))
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
        setSaving(false)
      }

      const save = () => submit({
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        ...(draft.apiKey.trim().length > 0 ? { apiKey: draft.apiKey.trim() } : {}),
      })
      const clear = () => submit({ clearApiKey: true })

      if (loading) {
        return h('div', { className: 'mimg-page' },
          h('style', null, CSS),
          h('h2', null, t('settings.title')),
          h('p', { className: 'mimg-hint' }, t('settings.loading')))
      }

      // A failed read must not offer an editable form: saving it would overwrite
      // the stored endpoint with defaults.
      if (loaded === null) {
        return h('div', { className: 'mimg-page' },
          h('style', null, CSS),
          h('h2', null, t('settings.title')),
          h('div', { className: 'mimg-alert', role: 'alert' },
            h('span', null, `${t('settings.loadFailed')}: ${error ?? ''}`),
            h('button', { type: 'button', className: 'mimg-button', onClick: load }, t('settings.loadRetry'))))
      }

      const keyWritable = loaded.keyWritable !== false

      return h('div', { className: 'mimg-page' },
        h('style', null, CSS),
        h('h2', null, t('settings.title')),
        h('p', { className: 'mimg-intro' }, t('settings.intro')),
        h('div', { className: 'mimg-card' },
          h('label', { className: 'mimg-field' },
            h('span', { className: 'mimg-label' }, t('settings.baseUrl')),
            h('input', {
              className: 'mimg-input',
              type: 'text',
              value: draft.baseUrl,
              spellCheck: false,
              onChange: edit('baseUrl'),
            }),
            h('p', { className: 'mimg-hint' }, t('settings.baseUrlHint'))),
          h('label', { className: 'mimg-field' },
            h('span', { className: 'mimg-label' }, t('settings.model')),
            h('input', {
              className: 'mimg-input',
              type: 'text',
              value: draft.model,
              spellCheck: false,
              onChange: edit('model'),
            }),
            h('p', { className: 'mimg-hint' }, t('settings.modelHint'))),
          h('div', { className: 'mimg-field' },
            h('label', { className: 'mimg-label', htmlFor: 'mimg-api-key' }, t('settings.apiKey')),
            h('div', { className: 'mimg-row' },
              h('input', {
                id: 'mimg-api-key',
                className: 'mimg-input',
                type: 'password',
                autoComplete: 'off',
                disabled: !keyWritable,
                value: draft.apiKey,
                placeholder: loaded.hasKey === true ? t('settings.apiKeySet') : t('settings.apiKeyPlaceholder'),
                onChange: edit('apiKey'),
              }),
              h('button', {
                type: 'button',
                className: 'mimg-button',
                disabled: saving || !keyWritable,
                onClick: clear,
              }, t('settings.clear'))),
            h('p', { className: loaded.hasKey === true ? 'mimg-hint mimg-status-line is-set' : 'mimg-hint mimg-status-line' },
              keyWritable
                ? (loaded.hasKey === true ? t('settings.apiKeySet') : t('settings.apiKeyMissing'))
                : t('settings.readOnlyKey')))),
        h('div', { className: 'mimg-actions' },
          h('button', {
            type: 'button',
            className: 'mimg-button is-primary',
            disabled: saving,
            onClick: save,
          }, saving ? t('settings.saving') : t('settings.save')),
          notice === null ? null : h('span', { className: 'mimg-status-line is-set', role: 'status' }, notice),
          error === null ? null : h('span', { className: 'mimg-error', role: 'alert' }, `${t('settings.saveFailed')}: ${error}`)),
        h('p', { className: 'mimg-foot' }, t('settings.note')))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'minimax-image: dictionaries')
        const t = ctx.locale.bind(NS)

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'minimax-image',
          order: 20,
          label: () => t('chip.label'),
          locale: NS,
        }, ImageChip))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'minimax-image',
          order: 60,
          label: () => t('settings.title'),
          locale: NS,
        }, ImageSettings))
      },
    }
  },
})
