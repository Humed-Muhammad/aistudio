# Humed’s AI Studio

**A free, local video studio for TikTok, Reels and Shorts, built for Amharic and English creators.**

Upload a talking video, and Humed’s AI Studio cuts the retakes and pauses, adds animated captions, text pops, zooms, B-roll, sound effects and a studio background, then renders a ready-to-post 9:16 video on your own Mac. It also makes motion-graphics ads from your photos and cleans noisy audio.

<!-- Demo: add a short screen recording or GIF here, e.g. docs/demo.gif -->

## What's inside

| Tool | What it does |
| --- | --- |
| **Shorts editor** (`/shorts`) | Cut → captions → graphics → look → sound → render. "Edit it for me" does the whole edit in one click; you review and ask for changes in your own words. Clients and brand kits for editing for other people. |
| **Motion graphics** (`/graphics`) | Promos, explainers and ads from your images. Describe it, Claude Code builds the animation, then change any word, price or color and re-render in seconds. |
| **Audio cleaner** (`/cleaner`) | Removes fans, hum, hiss and room noise from audio or video, and writes a transcript with subtitles (SRT). |

All three share one app, one sidebar and four color themes.

### Shorts editor highlights

- **Smart cut**: drops retakes, false starts, filler words and long pauses; keeps every point and the payoff. Speech is only ever cut, never regenerated.
- **Captions** in Amharic (Ethiopic script) and English, many styles (duo, light sweep, word-by-word lift …), placed just under the chin and kept clear of the platform buttons.
- **Graphics**: text pops, cards (steps, lists, stats, quotes), zoom punch-ins, transitions, emoji or images that follow your hand, text behind you.
- **Looks**: put yourself on a studio wall (16 looks, lamps, light patterns, color grade) using a local person cutout. No green screen needed.
- **B-roll**: drop in screen recordings; they play over the edit while you keep talking.
- **Sound**: volume levelled to −14 LUFS, optional noise removal, and sound effects that you can audition and pick.
- **Post text**: three title options, a description and hashtags written from your own words.
- **Clients**: notes and brand kits per client, so every video for them starts in their style.

## What it costs

The software is free (MIT). Everything renders on your Mac. Two optional services use **your own** keys and are paid per use:

| Service | Needed for | Without it |
| --- | --- | --- |
| [Claude API](https://console.anthropic.com) (`ANTHROPIC_API_KEY`) | One-click "Edit it for me", auto-planning, post text | Plan the edit by asking Claude Code, or edit by hand in the UI |
| [ElevenLabs](https://elevenlabs.io) (`ELEVENLABS_API_KEY`) | **Amharic transcripts** (Scribe) and "Strong" noise removal | English transcripts run locally with whisper.cpp; Light noise removal is local |

Motion graphics builds use your Claude Code plan (not an API key).

## Requirements

- A Mac with Apple Silicon (M1 or newer). Rendering is local, so 16 GB RAM is comfortable.
- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 22+](https://nodejs.org) (Shorts editor works with 18+; Motion graphics needs 22+)
- [Google Chrome](https://www.google.com/chrome/)
- [Claude Code](https://claude.com/claude-code) (only for Motion graphics builds, or to have Claude edit for you)

Disk: about 3 GB after full setup, plus your videos. The person-cutout model (~107 MB) downloads on first use.

## Setup

```bash
git clone <this repo> ai-studio && cd ai-studio
make setup       # Python environment and packages, creates .env
make shorts      # Shorts editor + Audio cleaner (tracking, Remotion, whisper.cpp, studio UI)
make graphics    # Motion graphics (HyperFrames, local FFmpeg; ~200 MB inside graphics-kit/)
make doctor      # checks everything; prints no key values
make run         # opens on http://127.0.0.1:8770
```

Then open `.env` and add the keys you want (all optional, see above). Restart with `make run` after changing it.

Prefer a coding agent? Open the folder in Claude Code and say: *"Set up Humed’s AI Studio for me following the README. Don't spend any API credit."*

## Using it

1. **Shorts**: click **New video**, drop in one or more recordings (they are joined in name order), pick the spoken language (**Amharic** by default; avoid auto-detect for Amharic), and tick **Edit it for me**. Watch the draft, then ask for changes in plain words or adjust any tab by hand. Render the final and copy the post text from **Deliver**.
2. **Motion graphics**: create a project with your images, describe the ad, let Claude draft the 4-part brief, build, then tweak text and colors and render.
3. **Audio cleaner**: drop a file, choose Light (free) or Strong (ElevenLabs), choose the language, and compare Original ↔ Cleaned with one switch.

Command-line versions exist for everything: `python shorts.py --help`, `python graphics.py --help`, `python cleaner.py --help`.

### Working with Claude Code

`AGENTS.md` tells coding agents how each workflow runs. You can ask Claude Code to cut, plan, revise or write post text for a video by hand, which uses your Claude plan instead of API credit.

## Privacy

Humed’s AI Studio listens on `127.0.0.1` only. Your videos stay in `runs/` on your Mac. Audio is sent to ElevenLabs only when you choose Amharic transcription or Strong noise removal; transcripts, keyframes and uploaded images are sent to Anthropic only when you use the Claude API features. Don't expose the app to the internet: it has no login.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A tool says it isn't installed | Run the `make` target it names, then `make doctor`. |
| Amharic words missing from captions | Set the language to Amharic (not auto) and make sure `ELEVENLABS_API_KEY` is set. |
| Render fails or Chrome crashes | Set `SHORTS_BROWSER` in `.env` to your Chrome path. |
| UI looks out of date after an update | Run `cd motion && npm run studio:build`, then hard-refresh (Cmd+Shift+R). |
| The Mac gets hot or slow | Use `SHORTS_MATTE=fast` for the lighter cutout model. |

## Project layout

```
app.py              one server for all tools
shorts.py           Shorts engine (cut, plan, render)      shorts_app.py    its API
graphics.py         Motion graphics engine                 graphics_app.py  its API
cleaner.py          Audio cleaner engine                   cleaner_app.py   its API
clients.py          clients and brand kits
motion/             Remotion compositions (motion/src) and the studio UI (motion/studio)
static/             Motion graphics and Audio cleaner pages, shared sidebar (tools.css, tools.js)
docs/               caption/graphics style guide, motion-graphics guide
tests/              offline tests: make test (no paid calls)
```

## License

[MIT](LICENSE) © 2026 Humed Muhammad. Third-party tools and models keep their own licenses. See [THIRD-PARTY.md](THIRD-PARTY.md). Note: **Remotion is free for individuals and companies of up to 3 people; larger companies need a Remotion company license.**
