# Humed’s AI Studio

**A free, local video studio for TikTok, Reels and Shorts, built for Amharic and English creators. Runs on macOS, Ubuntu and Windows.**

Upload a talking video, and Humed’s AI Studio cuts the retakes and pauses, adds animated captions, text pops, zooms, B-roll, sound effects and a studio background, then renders a ready-to-post 9:16 video on your own computer. It also makes motion-graphics ads from your photos and cleans noisy audio.

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
- **Graphics library**: 63 ready-made animated graphics (lower thirds, titles, callouts, charts and counters, ratings, polls, comment replies, follow and subscribe nudges, price tags, menus, coupons, contact cards, countdowns, confetti, fireworks, chat bubbles…). Hover to preview, click to add, edit every word; they take your graphic style and colours. Describe a new one in your own words and Claude Code makes it, checks it renders and adds it; change, undo, hide or delete any time.
- **Looks**: put yourself on a studio wall (16 looks, lamps, light patterns, color grade) using a local person cutout. No green screen needed.
- **B-roll**: drop in screen recordings; they play over the edit while you keep talking.
- **Sound**: volume levelled to −14 LUFS, optional noise removal, and sound effects that you can audition and pick.
- **Post text**: three title options, a description and hashtags written from your own words.
- **Clients**: notes and brand kits per client, so every video for them starts in their style.

## What it costs

The software is free (MIT). Everything renders on your computer. Two optional services use **your own** keys and are paid per use:

| Service | Needed for | Without it |
| --- | --- | --- |
| [Claude API](https://console.anthropic.com) (`ANTHROPIC_API_KEY`) | One-click "Edit it for me", auto-planning, post text | Plan the edit by asking Claude Code, or edit by hand in the UI |
| [ElevenLabs](https://elevenlabs.io) (`ELEVENLABS_API_KEY`) | **Amharic transcripts** (Scribe) and "Strong" noise removal | English transcripts run locally with whisper.cpp; Light noise removal is local |

Motion graphics builds use your Claude Code plan (not an API key).

## Install

One script per system installs everything: the tools it needs (Python 3.12, Node.js 22, Chrome, Claude Code) and all three studio tools. It skips anything already installed, so it is safe to run again. It makes no paid API calls.

You need about **3 GB** of free disk space plus room for your videos, and an internet connection for the first install (10–20 minutes). Rendering happens on your computer: 16 GB RAM is comfortable, 8 GB works for short videos.

First get the files: click **Code → Download ZIP** on GitHub and unzip it, or run `git clone <this repo> ai-studio`.

### macOS (Apple Silicon or Intel)

1. Open **Terminal** (press Cmd+Space, type *Terminal*, press Enter).
2. Type `cd ` (with a space), drag the studio folder into the Terminal window, and press Enter.
3. Run:

   ```bash
   bash install-mac.sh
   ```

   It may ask for your Mac password (for Homebrew) or show an Apple pop-up to install command line tools. Click Install, then run the same command again.
4. Start the studio with `make run`, or double-click **start.command** in the folder. Then open http://127.0.0.1:8770.

> "Permission denied" or "cannot be opened"? Starting with `bash` as above always works. To run the scripts directly (`./install-mac.sh`, double-clicking `start.command`), make them executable once: `chmod +x install-mac.sh start.command`. If macOS blocks `start.command` the first time, right-click it → **Open** → **Open**.

### Ubuntu 22.04 / 24.04

1. Open a terminal in the studio folder (right-click the folder → **Open in Terminal**).
2. Run:

   ```bash
   bash install-ubuntu.sh
   ```

   It asks for your password once (for `sudo apt`).
3. Start the studio with `make run`, then open http://127.0.0.1:8770.

> To run it as `./install-ubuntu.sh` instead, make it executable first: `chmod +x install-ubuntu.sh`.

### Windows 10 / 11

The studio runs inside **Ubuntu on WSL2**, the Linux that is built into Windows. The script sets that up for you.

1. Open the studio folder in File Explorer.
2. Right-click **install-windows.ps1** → **Run with PowerShell**. Click **Yes** when Windows asks for administrator rights.
   - If right-click doesn't offer it, open PowerShell in the folder (Shift+right-click the empty space → **Open PowerShell window here**) and run:

     ```powershell
     powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
     ```

     `-ExecutionPolicy Bypass` lets this one script run without changing your Windows security settings.
3. **First run:** it installs WSL and Ubuntu. Restart Windows if asked. When the Ubuntu window opens, choose a username and password (the password stays invisible while you type). Then **run install-windows.ps1 again**.
4. **Second run:** it copies the studio into Ubuntu (`~/ai-studio`), installs everything there and puts a **Humed's AI Studio** shortcut on your desktop.
5. Double-click the desktop shortcut (or **start-windows.cmd**). Your browser opens http://127.0.0.1:8770. Keep the black window open while you work; close it to stop the studio.

> Your videos and files live inside Ubuntu. In File Explorer, open `\\wsl$\Ubuntu-24.04\home\<your Ubuntu name>\ai-studio`. Downloads from the studio go to your normal Windows Downloads folder.

### After installing

Add the keys you want to the `.env` file in the studio folder (all optional, see [What it costs](#what-it-costs)), then restart. On Windows, edit it inside Ubuntu: `nano ~/ai-studio/.env`. Run `make doctor` at any time to see what is ready; it never prints your keys.

<details>
<summary>Manual install (developers)</summary>

Install Python 3.12+, Node.js 22+, Google Chrome and a C compiler (Xcode command line tools or `build-essential`), then:

```bash
make setup       # Python environment and packages, creates .env
make shorts      # Shorts editor + Audio cleaner (tracking, Remotion, whisper.cpp, studio UI)
make graphics    # Motion graphics (HyperFrames, local FFmpeg; ~200 MB inside graphics-kit/)
make doctor      # checks everything; prints no key values
make run         # http://127.0.0.1:8770
```

</details>

Prefer a coding agent? Open the folder in Claude Code and say: *"Install Humed’s AI Studio for me with the install script for my system. Don't spend any API credit."*

## Using it

1. **Shorts**: click **New video**, drop in one or more recordings (they are joined in name order), pick the spoken language (**Amharic** by default; avoid auto-detect for Amharic), and tick **Edit it for me**. Watch the draft, then ask for changes in plain words or adjust any tab by hand. Render the final and copy the post text from **Deliver**.
2. **Motion graphics**: create a project with your images, describe the ad, let Claude draft the 4-part brief, build, then tweak text and colors and render.
3. **Audio cleaner**: drop a file, choose Light (free) or Strong (ElevenLabs), choose the language, and compare Original ↔ Cleaned with one switch.

Command-line versions exist for everything: `python shorts.py --help`, `python graphics.py --help`, `python cleaner.py --help`.

### Working with Claude Code

`AGENTS.md` tells coding agents how each workflow runs. You can ask Claude Code to cut, plan, revise or write post text for a video by hand, which uses your Claude plan instead of API credit.

## Privacy

Humed’s AI Studio listens on `127.0.0.1` only. Your videos stay in `runs/` on your computer. Audio is sent to ElevenLabs only when you choose Amharic transcription or Strong noise removal; transcripts, keyframes and uploaded images are sent to Anthropic only when you use the Claude API features. Don't expose the app to the internet: it has no login.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A tool says it isn't installed | Run the `make` target it names, then `make doctor`. |
| Amharic words missing from captions | Set the language to Amharic (not auto) and make sure `ELEVENLABS_API_KEY` is set. |
| Render fails or Chrome crashes | Set `SHORTS_BROWSER` in `.env` to your Chrome path. |
| Windows: "running scripts is disabled on this system" | Use the `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1` command from the install steps. |
| Windows: the page doesn't open | Wait a few seconds after the black window says the server started, then reload http://127.0.0.1:8770. |
| Ubuntu: `python3.12` not found on an older release | The installer adds the deadsnakes PPA for you; on non-Ubuntu systems install Python 3.12 yourself. |
| UI looks out of date after an update | Run `cd motion && npm run studio:build`, then hard-refresh (Cmd+Shift+R). |
| The computer gets hot or slow | Use `SHORTS_MATTE=fast` for the lighter cutout model. |

## Project layout

```
install-mac.sh      one-step install: macOS        install-ubuntu.sh  Ubuntu        install-windows.ps1  Windows (WSL)
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
