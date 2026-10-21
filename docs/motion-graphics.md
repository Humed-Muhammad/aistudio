# Motion graphics guide

How Claude Code writes, checks and renders a motion graphic in this repo. The method comes from making promos, explainers
and ads as **code** (HTML + GSAP, rendered by HyperFrames) instead of with a video model:

- A video model returns flat pixels: a typo or a new price means generating again, and the new version comes out different.
- A coded video is editable. Every word, price, color and image is a value, so a change is one line and everything else
  (timing, motion, layout) renders identically. No regeneration and no extra credits.
- The trade-off: code can only draw what it can draw. That means text, shapes, charts and **your own images**. For photoreal
  people or products, make or shoot the images first, then animate them here.

## 1. The 4-part brief (plan before writing code)

Writing a composition uses a lot of Claude usage, so plan it in chat first and only then build. A good brief has four parts,
saved in `brief.json` (`who`, `look`, `scenes`, `rules`):

1. **Who, where, how long.** For example: "A 20-second Instagram Reels promo for a barbershop in Bole."
2. **The look.** Colors as hex codes, fonts, mood. For example: "#0B0D12 black, #FFD60A yellow, condensed bold headlines, confident and fast."
3. **Scene by scene, with seconds.** For example: "0–4 s hero photo pushes in, headline rises; 4–9 s product floats, price counts up; …"
4. **Rules: what it must never do.** For example: "never more than 6 words on screen; prices always in the accent color; no emoji."
   The rules matter most. They are what make the first version land close.

If a part is missing or vague, ask the creator for it (it is a creative choice). Do not invent a brand's colors or prices.

The creator can write the four parts themselves, or type a request in their own words and press **Draft the brief**
(`python graphics.py draft JOB "…"`): Claude Code looks at the uploaded images and writes all four parts, leaving
`[placeholders]` for prices, phone numbers, addresses and claims it was not given. The creator edits the draft and saves it;
a build is refused while any `[placeholder]` remains.

## 1b. Build with Claude Code (from the app)

**Build with Claude Code** (`python graphics.py build JOB --model sonnet|opus|haiku`) runs the Claude Code CLI headless
(`claude -p`) on the creator's own Claude plan: `ANTHROPIC_API_KEY` is removed from its environment, so nothing is billed to
the API. It finds the CLI on PATH, in the VS Code/Cursor extension, or at `CLAUDE_BIN`. Permissions are fixed with
`--permission-mode dontAsk` and absolute-path rules: it may read the project, this guide, AGENTS.md, the kit, the template and
the skills; write only inside the project; and run only `graphics.py check|snapshot|content|render` (draft) for that project.
`.env` and shell readers (`cat`, `head`, `grep` …) are denied. The previous `index.html` is copied to `history/` first and
**Undo** restores it; the run's log is `build.log` and every build or change is recorded in `claude-runs.json` (Undo steps back one at a time). A build that leaves `index.html` unchanged fails
with Claude's explanation instead of rendering the starter. Time limit: `GRAPHICS_BUILD_MINUTES` (default 30).

**Ask Claude for a change** (`python graphics.py change JOB "make the price bigger"`) is for design changes to an existing
animation: size, speed, motion, layout, scene order. Claude reads `index.html`, makes only that change with small edits, keeps
the content block and everything else as it is, checks, snapshots only the 2-4 moments it touched, and renders a draft. It uses
the same permissions and backup as a build and usually takes under a few minutes (`GRAPHICS_CHANGE_MINUTES`, default 15).
Words, prices, colors and pictures do not need Claude: change them in Content and re-render (seconds).

## 2. Project layout

`python graphics.py new TITLE [--size portrait|square|landscape] [--image …] [--music …]` creates `runs/graphics/JOB/`:

| Path | What it is |
|---|---|
| `index.html` | The composition. Starts as the 12 s starter (hero → product → detail → call to action). |
| `kit/motion-kit.js` | Seek-safe GSAP recipes for animating images and text (below). Local copy, so renders never need the network. |
| `kit/gsap.min.js`, `kit/fonts.css`, `kit/fonts/` | GSAP and local fonts: Inter (body), Anton (display), Noto Sans Ethiopic (Amharic). Kefa is the system fallback. |
| `assets/` | Uploaded images (EXIF-rotated, ≤2400 px; transparent images stay PNG), `music.*`, placeholders. |
| `brief.json` | The 4-part brief. |
| `review/` | Snapshot PNGs for visual review. |
| `renders/draft.mp4`, `renders/final.mp4` | Outputs. |

Either rewrite `index.html` for the brief or adapt the starter. Both are fine. Keep it one file unless the piece is long.

## 3. The content block (required)

Every word, price, color, image path and on/off choice goes in **one** block at the top: `data-composition-variables` on
`<html>` (a JSON array of `{id, type, label, default}`; types `string`, `number`, `color`, `boolean`, `enum` with `options`).

- Text: read once at start-up with `window.__hyperframes.getVariables()` and set `textContent` **before** splitting it for
  animation (`K.words` replaces the text with spans).
- Images: `<img data-var-src="image1" src="assets/placeholder-1.svg">`. The `src` is the fallback; keep it a real file.
- Colors: every variable is also a CSS property on the root, so use `var(--accent)` in CSS.
- Name image slots `image1`, `image2`, …; the app shows them as pickers with thumbnails and fills empty slots on upload.
- Labels are what the creator sees in the app's Content form. Write them plainly ("Price", "Call to action").

The app and `python graphics.py content JOB --set price='$30'` edit these defaults in place; no code change, no new Claude run.

## 4. Animating images: `window.MotionKit`

```js
const K = window.MotionKit, tl = gsap.timeline({ paused: true });
K.kenBurns(tl, "#img1", { at: 0, dur: 4, from: { scale: 1.2, y: 40 }, to: { scale: 1, y: -20 } });
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;   // the root data-composition-id
```

Every helper adds tweens to `tl` at an absolute time `at` (seconds) and is safe to seek to any frame.

| Recipe | Use it for | Key options |
|---|---|---|
| `kenBurns(tl, el)` | Slow push-in or pan over a photo (put the `<img>` in an `overflow:hidden` frame) | `from`, `to`, `dur` |
| `reveal(tl, el)` | Clip-path entrance or exit | `style`: wipe-left/right/up/down, center, circle, diamond, blinds; `out: true` to hide |
| `parallax(tl, layers)` | Depth from flat layers (background slow, foreground fast) | `dx`, `dy`, `depths` |
| `float(tl, el)` | Product hovering: bob and sway | `amp`, `rotate`, `cycles` (whole number) |
| `tilt(tl, el)` | 3D swing towards the viewer (cards, phones, boxes) | `from`/`to` rotationX/Y, `perspective` |
| `shine(tl, el)` | Light streak across a product | auto-masked to the image shape when the frame has class `cutout` |
| `tiles(tl, el)` | Image assembles from a grid of flying tiles | `rows`, `cols`, `spread` |
| `slideshow(tl, els)` | Several photos in one frame (same-size slides inside one `overflow:hidden` box) | `transition`: push, zoom, wipe, crossfade; `each` |
| `zoomThrough(tl, el)` | Camera flies into the scene, as a transition out | `scale`, `origin` |
| `focusPull(tl, el)` | Blur to sharp | `blur` |
| `popIn(tl, el)` / `exit(tl, el)` | Stickers, badges, cut-outs in / anything out | `exit` style: fade, up, down, left, right, shrink |
| `words(tl, el)` | Headline rises word by word (Ethiopic-safe: splits on spaces only) | `stagger` |
| `countUp(tl, el)` | Prices and stats roll up; keeps the text around the number ("120 ብር") | `from`, `dur` |
| `typeOn(tl, el)` | Typewriter for handles, phone numbers, URLs | `cps` |

For anything the kit doesn't cover, use plain GSAP (`tl.fromTo(…, at)`), or install a HyperFrames block
(`graphics-kit/node_modules/.bin/hyperframes add parallax-zoom --dir runs/graphics/JOB --no-clipboard` writes
`compositions/components/parallax-zoom.html` to adapt from; others include `cinematic-zoom`, `product-turntable`,
`particle-image-reveal`, `before-after-wipe`, `count-up`). Always pass `--no-clipboard`, or it replaces the creator's clipboard. The installed `/hyperframes` and
`/motion-graphics` skills in `.claude/skills/` hold the framework rules; follow them for composition structure.

**Transparent product shots** (PNG cut-outs from an image tool or a background remover) float as cut-outs: in the starter set
`productFit` to `cutout` (done automatically when the product image has transparency). Photos stay in a card.

## 5. Rules for every composition

- Deterministic only: no `Math.random()`, `Date.now()`, network fetches, `repeat: -1`, or playing/seeking media in code.
- One paused root timeline registered on `window.__timelines[<root composition id>]`; timed elements need `data-start`,
  `data-duration` and `class="clip"`.
- Every element enters **and** leaves with motion; nothing pops on or off for a single frame.
- Respect the brief's rules (word limits, colors, no emoji). Write on-screen text in the creator's language; Amharic in
  Ethiopic script, using `var(--font-body)` or `var(--font-display)` so Noto Sans Ethiopic is used.
- Audio: one `<audio id="music" …>` for music or a voice-over (`graphics.py music JOB FILE` writes it). Never generate or
  alter the creator's voice.
- Keep the root `data-duration` equal to the end of the last scene; update the music clip's `data-duration` to match.

## 6. Check, review, render

```bash
python graphics.py check JOB          # lint: fix every error and review every warning
python graphics.py snapshot JOB --at 0.5,2,4.5,7,10   # PNG stills in review/; LOOK at them
python graphics.py render JOB         # draft (seconds)
python graphics.py render JOB --final # only after the creator approves the draft
```

Visual review is required before showing a draft: look at the snapshot frames (and frames from the draft) for cropped or
overflowing text, unreadable contrast, empty frames, missing images or fonts, broken Ethiopic, and elements stuck on screen.
Fix and re-check. Lint passing alone is not approval. Report what you checked and anything you could not verify.

`python graphics.py preview JOB` opens HyperFrames Studio to scrub through the piece in a browser.

## 7. Privacy and cost

- Everything renders locally with the project's own FFmpeg and the installed Chrome. HyperFrames telemetry is disabled.
- Do **not** run `hyperframes publish`, `cloud render`, `lambda`, `cloudrun`, `auth`, `tts`, music generation, or
  feedback/telemetry reports, even when a skill suggests them; they upload content or cost money. Ask first.
- `graphics.py` strips Gemini and other cloud keys from HyperFrames' environment so `snapshot` never sends frames anywhere.
- Large optional downloads (local TTS, MusicGen or ACE-Step music models, background-removal models) need the creator's OK.
