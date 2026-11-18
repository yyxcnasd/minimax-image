# minimax-image

MiniMax **H3 image** generation and editing for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), as an installable DSH bundle.

- **Composer chip** — `生图：不允许 / 允许` next to the permission and mode chips in the composer tool row. Default **不允许**; the choice is stored on the Host per conversation.
- **Two model tools while it is on** — switching the chip to **允许** adds both:
  - `generate_image` — text to image (`POST /v1/images/generations`);
  - `edit_image` — edit or combine 1–16 reference images with an instruction (`POST /v1/images/edits`).

  The model chooses `aspect_ratio` and `area` per call; the plugin does not force defaults from settings.
- **Settings page** — **Settings → MiniMax 生图** configures the endpoint, the model (`MiniMax-H3-Image` by default, or `MiniMax-H3-Image-Highspeed`), and the API key.

## Install

Requires a DSH profile that composes the Web surface bundle (`@deepseek-ai/dsh-web-app`), because the chip and the settings page are browser surfaces and the Host route lives on the web server.

### From GitHub

```sh
dsh plugin --profile desktop add github:yyxcnasd/minimax-image
```

The package ships plain ESM with no build script, so pnpm runs nothing at install time and no `allowBuilds` entry is needed. Pin a commit if you want immutability:

```sh
dsh plugin --profile desktop add github:yyxcnasd/minimax-image#<commit-sha>
```

A git install shells out to `git ls-remote` against `github.com:443`, so on a network that blocks that host use the npm package or a packed tarball instead (`dsh plugin --profile desktop add ./minimax-image-0.3.1.tgz`).

### From npm

```sh
dsh plugin --profile desktop add minimax-image
```

### From a local checkout

```sh
dsh plugin --profile desktop add ./minimax-image
```

`dsh plugin --profile <name> add ...` forwards to pnpm inside `$DSH_HOME/profiles/<name>`, then appends the bundle to `dsh.profile.bundles`. Use `web` instead of `desktop` for a web profile — the same bundle serves both.

**Restart DeepSeek Harness once** after installing: a Loader row added into a running profile cannot resolve the profile's core services until the process restarts. The chip and the settings page appear after that restart; a browser page refresh then picks up the client half.

Uninstall with:

```sh
dsh plugin --profile desktop remove minimax-image
```

## Configuration

1. **Settings → MiniMax 生图**: set the endpoint (`https://api.minimaxi.com`), the model, and paste your MiniMax API key (`sk-api-…`). Save.
2. In a conversation, switch the composer chip to **允许**.
3. Ask for an image, or ask to change one you generated or attached.

Endpoint and model are stored in `$DSH_HOME/minimax-image/settings.json` and apply to the next request. The API key is stored in the profile credential store under the reference `MINIMAX_IMAGE_API_KEY` (never in plugin configuration, never in the settings file). The row in the profile patch only supplies the initial endpoint, model, and credential reference:

```yaml
- insert:
    - id: minimax-image
      name: minimax-image
      config:
        baseUrl: https://api.minimaxi.com
        model: MiniMax-H3-Image
        apiKeyEnv: MINIMAX_IMAGE_API_KEY
```

## Behaviour notes

- `generate_image` posts `model`, `prompt`, `n`, `response_format: "url"`, `area`, and `aspect_ratio` (omitted when the ratio is `auto`). `edit_image` adds `images: [{ image_url }]`; local files are inlined as `data:image/…;base64,…`, capped at 20 MB each and 45 MB per request, so pass an `http(s)` URL for anything larger.
- The service derives width and height from the ratio and area and reports them per image as `data[].size`; the tool result records that exact size beside each saved file.
- A partial failure is still HTTP 200: every successful image is saved and the failed ones are listed in the tool result. When nothing succeeds, the tool fails with the service's own message.
- Files land in `<session workspace>/generated-images/` as `minimax-<timestamp>-<n>.<ext>` (generated) or `minimax-edit-<timestamp>-<n>.<ext>` (edited).
- Results are text plus paths; open a path with the built-in `read_image` tool to display the picture inline.
- The menu is the plugin's own card (portaled to `document.body`), styled from the shipped menu tokens: ArrowUp/ArrowDown move focus, Enter/Space picks, Escape closes, a pointer press outside closes, and the chevron rotates while it is open.

## Privacy

- Per-conversation switches: `$DSH_HOME/minimax-image/sessions.json`.
- Endpoint and model: `$DSH_HOME/minimax-image/settings.json`.
- API key: the profile credential store (`$DSH_HOME/.credentials.yaml`, owner-only permissions).
- Generated images: the conversation working directory, under `generated-images/`.
- Requests go only to the configured endpoint; nothing else is transmitted.

## Limitations

- Streaming (`stream: true`) is not used; both tools wait for the complete response.
- HEIC/HEIF references are recognised by extension only.
- The API key is stored per credential reference, not per model: switching the model keeps the same key.
- Editing the package's files in place does not hot-swap the running Host module; a code update needs a restart.

## Releasing

The registry name is exactly `minimax-image` — that is what `dsh plugin add minimax-image` resolves. There is no build step: `index.js` and `client.js` are the shipped files, and `files` already lists every runtime asset.

```sh
npm publish
gh release create v0.3.1 --generate-notes   # optional
```

## License

MIT
