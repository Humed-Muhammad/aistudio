# Shorts style guide

How the Shorts editor should look and sound. The auto-planner follows this, and so should Claude Code when it writes a plan by hand.

## Look

- **Captions (default: Clean).** Bold white phrase on a dark rounded box; the word being said turns accent-coloured with a small pop. Readable on bright, busy phone footage. Editorial (below) is the elegant alternative for calm, dark footage.
- **Editorial captions.** Small white sans-serif words appear as they are spoken. About one word per sentence switches to a large italic serif in the accent colour: the key noun, number or punchline. Put those words in the plan's `emphasis` list exactly as spoken (Amharic in Ge'ez script). Keep captions at chest height (`caption_y` about 0.6–0.75), never over the face.
- **Accent colour.** Warm yellow `#FFD60A` by default (text on yellow is near-black). Use one accent per video.
- **Text pops.** Plain words with a soft halo, or with `background: pill` a solid accent badge with dark text and one light sweep. No emoji anywhere.
- **Scenes.** Two worlds:
  - *Dark glow:* deep navy to black, soft blue and purple light, frosted-glass cards.
  - *Light grid:* warm paper with a fine grid, white cards with soft shadows.

  Pick one world per video and stay in it, except for occasional `dim` and `overlay` cards.
- **One focal element at a time.** A card fills the moment. Don't also add a text pop or a sticker.
- **Headlines.** Mostly plain words, with the important ones wrapped in `*stars*` for the serif accent, for example `Reserve your *visual effects*`.

## Card templates

| Template | Use it when the speaker… | Fields |
|---|---|---|
| `steps` | counts through a structure ("number 1… number 2…"). Repeat the card at each new step with `active` +1. | `items`, `active`, `text` |
| `slider` | describes a move from one state to another (beginner → pro, slow → fast) | `label` "From\|To", `value` 0-100, `text` |
| `stat` | says a number worth remembering | `value` "400%", `label`, `text` |
| `icons` | names tools or apps (Telegram, the bot, the agent) | `items` emoji + label, or uploaded logos |
| `list` | previews or lists points ("in this video…") | `text`, `items`, `active` |
| `chips` | lists many examples around one idea | `text`, `items` (4–6) |
| `quote` | says a line worth reading | `text`, `label` (author) |
| `title` | starts a new section or makes the hook | `text`, `label` (kicker) |
| `progress` | says they almost finished and then stopped | `text` (what), `value` (how far, e.g. 92), `label` (why it stopped) |

Scenes:
- `overlay`: on top of the speaker.
- `dim`: speaker darkened and blurred behind the card.
- `dark` or `light`: full-screen cutaway, 2–4 s.
- `split`: graphic on one side, speaker on the other.

In split and full-screen scenes the graphic slides in from `side` (top, bottom, left or right) and pushes the speaker video the other way, then pulls back out.

Full-screen cards and screen recordings never overlap.

## Animation categories

- **Text-centric:** title, quote, editorial captions, text pops.
- **Object-centric:** icons, stat, slider, stickers on hands.
- **Character-centric:** the speaker; zooms, split, dim, cut-out text behind the speaker.
- **Video-centric:** screen recordings (B-roll) in full, split, bubble or front layouts.

Mix the categories over a video. Space emphasis 2–5 s apart.

## Sound

Sound only emphasises what the viewer can see, it stays sparse, and every effect sits clearly under the voice: levels are set from the measured loudness of the speaker, not from full scale. With `auto_sound` on, the editor places:

| On screen | Sound | Level vs. voice |
|---|---|---|
| Real movement (zoom of 1.15× or more, full-screen scene or recording arriving) | whoosh, loudest moment on the fastest frame; at most one per 1.5 s | −14 dB |
| A new element (text pop, sticker, overlay card, each list row or step as it appears) | click / pop; at most one per 0.8 s | −11 dB |
| Flash | camera click | −11 dB |
| Full-screen scene arriving | impact (only from your own pack) | −11 dB |
| Big segment change, at most one per 25 s | riser ending on the cut + hit (only from your own pack) | −9 / −10 dB |

Sounds are real recordings. The creator's own pack in `sfx-library/` wins. It can be organised in folders or by file-name prefix:
- `whoosh/`
- `click/`
- `camera/`
- `impact/`
- `riser/`
- `hit/`
- `success/`

Otherwise Remotion's free hosted recordings are used (cached in `models/sfx-cache/`). Risers, hits and impacts play only from your own pack. Add `sfx` events by hand only for moments the rules miss; a planned sound wins over an automatic one nearby. There is no music under graphics.

## Motion rules

- Back-to-back cards with the same content are merged into one continuous card whose highlight moves on, so a tracker or list never leaves and re-enters.
- List rows, chips and icons appear one by one when their words are spoken.
- Hand images stay while the hand is up and bridge short tracking drops.
