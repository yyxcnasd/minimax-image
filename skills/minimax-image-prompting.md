---
name: minimax-image-prompting
description: Write MiniMax H3 image prompts and run an image session well: interview the user for the missing style decisions, lock one art direction for a series, pick aspect ratio and area, edit by naming what changes and what stays, and recover from weak results by changing one lever at a time.
whenToUse: Use whenever the user asks for an image, a picture, a poster, a product shot, a character, a wallpaper, an illustration, or asks to change an image that already exists — including requests that arrive without any style direction.
---

# Image prompting for MiniMax H3

This plugin exposes two tools: `generate_image` (text to image, `POST /v1/images/generations`) and `edit_image` (reference-image editing, `POST /v1/images/edits`). Both accept `prompt`, `aspect_ratio`, `area`, and `count`; `edit_image` also takes `images` (1–16 absolute paths or http(s) URLs). The service applies prompt enhancement by default and returns the enhanced text as `revised_prompt`; treat that as feedback about how your prompt was read.

You are the art director. The user should not have to know how to prompt.

## 1. Decide whether to ask, then ask once

Ask **at most two questions**, each with a recommended default, and only for decisions that change the picture. Everything else you decide and state.

Ask when:
- the subject is clear but the **use** is not (banner? avatar? phone wallpaper? print?) — the use fixes the aspect ratio;
- the user gave a vague noun ("a cat", "a car") without a **moment** or **mood**;
- the request is for a **series** or a set, and no style is named;
- the answer determines whether the job is a generation or an edit.

Do not ask when the answer is inferable: lighting, lens, palette, framing, medium. Propose them.

Question shape: one sentence, two or three concrete options, the default first.

```
这张图主要用在哪？① 横版封面/PPT（16:9）② 手机壁纸（9:16）③ 头像或产品图（1:1）— 不回答我就按横版 16:9。
```
```
想要什么质感？① 真实胶片感 ② 干净商业摄影 ③ 插画/绘本 — 默认商业摄影。
```

If the user says "你决定 / whatever / just do it", pick the first option, say what you picked in one line, and generate. Never ask a third question.

Use `ask_user_question` when the conversation already uses that surface for choices; otherwise plain text is fine and faster.

## 2. The prompt skeleton

Build the prompt from seven slots, in this order. One clause per slot; drop any slot that adds nothing.

1. **Subject and action** — what it is, doing what, in one beat ("a barista pushing a portafilter into a chrome espresso machine", not "coffee").
2. **Environment** — place, time of day, what is behind and around it.
3. **Light** — direction + quality ("low afternoon sun through blinds, hard shadows", "soft north window light").
4. **Camera / composition** — shot size and lens ("waist-up 50 mm", "wide establishing shot, 24 mm", "top-down flat lay").
5. **Medium and style** — photograph / 3D render / gouache illustration / risograph print / pixel art.
6. **Colour and texture** — palette words or hex, grain, material finish.
7. **Mood and detail** — the emotional temperature, plus 1–2 concrete details that make it specific.

Append an optional **avoid clause**: `no text, no watermark, no logo` (keep it to five items or fewer; there is no negative-prompt field).

Length: 1–3 sentences, roughly 60–150 words in English or 100–200 characters in Chinese. Longer prompts dilute attention; only expand when the scene genuinely has many subjects or a layout requirement.

Word choice: concrete nouns and visible adjectives beat abstractions. "Warm amber", not "nice colour". "Slightly overexposed", not "artistic". Name the light and the lens; those two change a photo more than any adjective.

## 3. Aspect ratio and area

Pick the ratio from the **use**, and say why in one short line.

| Use | `aspect_ratio` |
|---|---|
| Banner, cover, slides, cinematic still, landscape | `16:9` |
| Phone wallpaper, story, vertical poster, full-body character | `9:16` |
| Avatar, icon, product on seamless background, social square | `1:1` |
| Editorial spread, magazine layout, browser screenshot | `4:3` or `3:2` |
| Book page, portrait print, poster in a frame | `3:4` or `2:3` |
| Unsure, or the prompt already implies a shape | `auto` |

`area` trades detail for speed and cost:

- `1K` — drafts, small previews, quick iteration, several options at once;
- `2K` — the default for a final still that will be looked at on screen;
- `4K` — print, crops, or anything with fine texture the user will zoom into.

Always report the choice: `按横版 16:9、2K 出图。` Never silently pick 4K; it is slow and costly.

## 4. Lock one style for a series

A series fails when each prompt invents its own light. Write a **style block** once, then reuse it **verbatim** in every prompt; vary only the subject slot and the composition that the moment needs.

Style block template (six lines, ≤ 60 words):

```
medium: 35 mm film photograph, Kodak Portra 400
light: single soft window, camera-left, warm 3200 K, gentle falloff
palette: cream, olive, dusty terracotta, deep charcoal
lens: 50 mm, f/2, shallow depth of field, slight vignette
texture: fine grain, no digital sharpening
avoid: text, watermark, logo, plastic skin, HDR halos
```

Rules for a locked style:

- keep `medium`, `light`, `palette`, `lens` identical across the set;
- keep `aspect_ratio` and `area` identical too — a change of ratio changes composition more than any word;
- restate the block in every call; do not write "same style as before" (the model cannot see earlier prompts);
- when the user asks for a set, generate the first image, confirm it, then generate the rest against that block;
- when the user asks to break the style once, say so explicitly and keep the block for the others.

For a character that must recur, put the identity facts into a fixed character line (age range, build, hair, wardrobe, distinguishing mark) and repeat it verbatim; then use `edit_image` with the accepted picture as 图1 for every new pose instead of re-describing the face.

## 5. Editing prompts

`edit_image` names references by index in the order given: 图1, 图2, … The instruction must say **what changes and what stays**.

Template:

```
把图1里的 <要改的东西> 换成 <目标描述>，保持 <人物的脸/光线/构图/背景/色调> 不变。
```

Good edit deltas:

- one change per pass — background, then wardrobe, then time of day;
- name the anchor: "keep the same camera position and the same light direction";
- for combination, state the role of each reference: "图1 是人，图2 是服装，把图1 的衣服换成图2 的";
- for style transfer, pass the style reference second and say "把图1 处理成图2 的画风，构图和内容保持图1";
- text edits: quote the exact string, keep it short, and ask for one line at a time.

Do not stack five changes into one edit; two at most, or the whole image drifts.

## 6. Iterate by moving one lever

Review the result against the slots, name the single biggest miss, and change one lever:

| Symptom | Lever |
|---|---|
| Composition is wrong, subject too small/large | shot size + lens in the camera slot |
| Flat or muddy light | light slot: direction, quality, colour temperature |
| Colours feel cheap or garish | palette slot: fewer colours, name materials not hues |
| Looks like plastic / over-processed | medium slot: add film stock, grain, "no HDR" |
| Too busy | delete slots and details; shorten the prompt |
| Wrong subject detail | rewrite the subject clause with a concrete noun |
| Text is garbled | shorten to 1–3 words, quote it, ask for a clean sign area |
| Content safety refused | remove real people, brands, and trademarks; describe the scene generically |

Offer variants only while the user is exploring. Once they say "this one", stop exploring and switch to editing that image.

## 7. Templates

Fill the blanks; delete what does not apply.

**Product shot (1:1 / 2K)**

```
<Product> on <surface>, <position>, softbox key from camera-left with a subtle rim, macro 100 mm, f/8, clean seamless backdrop in <colour>, tactile material detail, commercial product photograph, no text, no logo
```

**Portrait (3:4 / 2K)**

```
<age range and build> <persona>, <expression>, wearing <wardrobe>, in <setting>, <time of day> light from <direction>, 85 mm portrait, f/1.8, shallow depth of field, <film stock>, natural skin texture, no watermark
```

**Landscape / establishing (16:9 / 2K)**

```
<place> at <time>, <weather>, <layers: foreground / midground / background>, <light direction>, wide 24 mm, eye level, <palette>, <medium>, atmospheric depth
```

**Food (4:3 / 2K)**

```
<dish> in <vessel>, <steam or garnish detail>, on <table material>, side window light with one soft shadow, 50 mm, three-quarter overhead, warm but not orange, editorial food photography
```

**Character sheet (9:16 / 4K)**

```
character sheet of <character>, <three poses: front / three-quarter / back>, neutral grey background, flat even light, <medium>, <palette>, consistent proportions, no text
```

**Poster with Chinese text (3:4 / 4K)**

```
<scene>, large clean area reserved at the top for a headline, <style>, high contrast, no small text; the poster reads 「<四到八个字>」
```

**Illustration (1:1 / 2K)**

```
<subject and action>, <setting>, <palette, 3–4 colours>, <medium: gouache / risograph / flat vector>, <line quality>, paper grain, no gradients
```

## 8. Worked upgrades

Weak: `漂亮的城市夜景`

Strong: `雨后的东京小巷夜景，湿沥青反射霓虹招牌，拉面店暖光从帘子缝里漏出，低机位 35 mm，青蓝色调搭配一点橙色，胶片颗粒，无人`

Weak: `a cat`

Strong: `an orange tabby cat asleep on a stack of newspapers by a sunlit window, dust in the air, 50 mm, shallow depth of field, warm morning light, film grain`

The upgrade adds exactly what the image was missing: place, moment, light, lens, palette, texture — never more adjectives of the same kind.

## 9. Working habits

- State the plan in one line before the call: ratio, area, and the one style decision you made.
- Generate one image first unless the user asked for options; `count` above 2 is for exploration only.
- After the call, tell the user the absolute path and offer to show it (`read_image`).
- If `revised_prompt` differs from your prompt in a way that hurts the picture, tighten the prompt on the next pass and say what you changed.
- If the API refuses with a content-safety error, do not retry the same text: remove the trigger (real person, brand, trademark, gore), describe the scene more abstractly, and tell the user what was removed.
- Never claim a style is "the same" across images unless you reused the identical style block.

## 10. Rights and safety

- Do not generate real people's likeness, living or dead, unless the user supplies the reference and has the right to it; when in doubt, make the person generic.
- No trademarks, logos, or copyrighted characters; describe the visual idea instead.
- Say what you did when a request was adjusted for these reasons — do not silently change the subject.
