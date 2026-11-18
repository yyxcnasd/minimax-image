# MiniMax image generation

Two model tools, one composer switch, and one settings page.

## Composer dropdown

A chip in the composer tool row, next to the permission and mode chips:

- a 14px creation glyph and the same 14px chevron the permission chip uses, both taken from the product icon set's regular weight (1px stroke on a 16px viewBox), then the locale label for the state (English: `Image: Off` / `Image: On`);
- the visual language follows the shipped permission chip: 28px tall, 13px/500 text in `--dsw-alias-label-secondary`, `--dsw-radius-sm`, transparent until hover, hover fill `--dsw-alias-interactive-bg-hover`, the product focus ring, and the same `@container (max-width: 460px)` rule that drops the label in a narrow composer while keeping the glyph and chevron;
- the visible chip is a plain `<button>`; opening it shows the plugin's own menu card (portaled to `document.body`, so the docked composer cannot clip or reposition it) with the shipped menu geometry: translucent `--dsw-menu-surface-fill` fill, `--dsw-elevation-prominent`, 4px card padding, 34px rows, and a trailing check on the current row;
- the chevron rotates 180° while the menu is open, and the product focus ring appears only for keyboard focus (`:focus-visible`), never as a box around a native control;
- menu keys: ArrowUp/ArrowDown move focus, Enter/Space picks, Escape closes and returns focus to the chip, Tab closes, a pointer press outside closes;
- the default for a conversation is **off**, and the Host remembers each conversation's choice;
- switching it on makes both tools available to the model on the next step; switching it off hides them again;
- the value is enforced twice: neither tool is offered to the model in a conversation that is off, and both refuse to run there even if called;
- when no API key is saved the glyph turns to the warning color and the tooltip says so, while the dropdown still records the choice;
- before the Host route can be reached the chip stays visible but disabled, with a tooltip saying image generation is not ready yet.

## Tools

Both tools take the same shape, and in both the model chooses the framing.

| Argument | Meaning |
|---|---|
| `prompt` | required; what the picture should show, or what to change (≤ 32000 characters) |
| `aspect_ratio` | optional; `auto` or `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16` |
| `area` | optional; `1K`, `2K`, or `4K` target area |
| `count` | optional; 1–10 images, default 1 |
| `images` | `edit_image` only: 1–16 reference images in order, each an absolute local path or an `http(s)` URL |

- `generate_image` posts to `/v1/images/generations` with `model`, `prompt`, `n`, `response_format: "url"`, `area`, and `aspect_ratio` (omitted when the ratio is `auto`).
- `edit_image` posts to `/v1/images/edits` with the same fields plus `images: [{ image_url }]`. A local file is read, size-checked, and inlined as `data:image/…;base64,…`; a URL passes through. The instruction refers to them as the first, second, … reference in the order given.

The service derives width and height from the ratio and area and reports them per image as `data[].size`; the tool records that exact size beside each saved file. Each item in `data` either carries `url` (valid for 24 hours) and `revised_prompt`, or an `error`. A partial failure is still HTTP 200, so the tool saves every successful image and lists the failed ones in its result; when nothing succeeds it fails with the service's own message.

Files are written to `<session workspace>/generated-images/` as `minimax-<timestamp>-<n>.<ext>` (generated) or `minimax-edit-<timestamp>-<n>.<ext>` (edited), with the extension taken from the response's `output_format`.

The result content is text, so the file renders through the built-in `read_image` card when the model opens it — the generic tool card does not draw image blocks for tools other than `read_image`.

## Bundled prompt skill

`skills/minimax-image-prompting.md` is registered at activation through `ctx.skills.register()` as the model-invocable skill `minimax-image-prompting`, so the model can load the full playbook with the `skill` tool whenever an image request arrives.

The playbook covers: the two-question interview that decides use, mood, and series style; the seven-slot prompt skeleton with a length budget and a five-item avoid clause; the aspect-ratio-to-use table and `1K / 2K / 4K` guidance; a reusable six-line style block that keeps a set of images in one art direction; edit discipline (one or two changes per pass, naming what must stay); a symptom-to-lever table for flat light, cheap colour, plastic texture, busy framing, garbled text, and content-safety refusals; prompt templates for product, portrait, landscape, food, character sheet, Chinese-text poster, and illustration; weak-versus-strong prompt pairs; and the rights rules for likeness and trademarks.

The registration is optional by design: a profile without `@deepseek-ai/dsh-skill` keeps both image tools and simply skips the skill. The markdown keeps filesystem-skill frontmatter so the same file also works copied into a skills directory; the registry path strips that frontmatter before handing the body to the model.

## Settings page

**Settings → MiniMax image generation**:

- **Endpoint** — defaults to `https://api.minimaxi.com`; a trailing `/v1` is accepted and normalized;
- **Model** — `MiniMax-H3-Image` (or `MiniMax-H3-Image-Highspeed`);
- **API Key** — write-only; the page reports whether a key is stored and can clear it.

Endpoint and model are written to `$DSH_HOME/minimax-image/settings.json`, so a save applies to the next request without a restart. The API key is written to the credential store as the `MINIMAX_IMAGE_API_KEY` reference and resolved per request. Aspect ratio and area are deliberately absent here: they belong to the model's per-call choice.

## Storage and privacy

- Per-conversation switches: `$DSH_HOME/minimax-image/sessions.json`.
- Endpoint and model: `$DSH_HOME/minimax-image/settings.json`.
- API key: the profile credential store (`$DSH_HOME/.credentials.yaml`, owner-only permissions).
- Generated images: the conversation working directory, under `generated-images/`.
- Requests go only to the configured endpoint; nothing else is transmitted.

## Installation and activation

```sh
dsh plugin --profile desktop add github:yyxcnasd/minimax-image   # or: add minimax-image (npm)
```

`dsh plugin --profile <name> add ...` forwards to pnpm in the profile and appends the bundle to `dsh.profile.bundles`; the same bundle serves the `web` and `desktop` profiles, provided the profile composes the Web surface bundle. Installing recomposes the profile and usually applies immediately; when the Loader answers `restart-required` (for example after editing a linked package's files, where it reports `module-comparison`), one restart is needed. A browser page refresh then picks up the new `client.js`.

## Limitations

- Streaming (`stream: true`) is not used; both tools wait for the complete response.
- Reference images are inlined as base64, so very large files should be passed as URLs; the per-image cap is 20 MB and the per-request cap is 45 MB.
- HEIC/HEIF references are recognised by extension only.
- The API key is stored per credential reference, not per model: switching the model keeps the same key.
- Generated images are ordinary files; deleting them does not affect the conversation record, and re-running a generation creates new files.
- The plugin does not render image blocks inside its own tool cards; it relies on the built-in `read_image` presentation.
