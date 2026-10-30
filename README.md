# Humed’s AI Studio

**A free, local video studio for TikTok, Reels and Shorts, built for Amharic and English creators. Runs on macOS, Ubuntu and Windows.**

Upload a talking video, and Humed’s AI Studio cuts the retakes and pauses, adds animated captions, text pops, zooms, B-roll, sound effects and a studio background, then renders a ready-to-post 9:16 video on your own computer. It also makes motion-graphics ads from your photos and cleans noisy audio.

<!-- Demo: add a short screen recording or GIF here, e.g. docs/demo.gif -->

## What's inside

| Tool | What it does |
| --- | --- |
| **Shorts editor** (`/shorts`) | Cut → captions → graphics → look → sound → render. "Edit it for me" does the whole edit in one click; you review and ask for changes in your own words. Clients and brand kits for editing for other people. |
| **YouTube to Shorts** (`/shorts?view=youtube`) | Paste a YouTube link. Claude reads the whole video (with YouTube's most-replayed graph) and finds the moments that hook, teach or matter most; each one is cropped to 9:16 around the speaker and edited as a short with a hook, captions and graphics. For videos you own or may reuse. |
| **YouTube channel** (`/shorts?view=channel`) | A faceless channel from start to finish: niche research on real YouTube numbers, a researched script you review, an ElevenLabs voice-over, cartoon illustrations with a recurring mascot (or stock footage), graphics for every number, a 16:9 video (3 minutes by default), shorts cut from it, titles, description with chapters, thumbnails, and an optional upload. |
| **Motion graphics** (`/graphics`) | Promos, explainers and ads from your images. Describe it, Claude Code builds the animation, then change any word, price or color and re-render in seconds. |
| **Audio cleaner** (`/cleaner`) | Removes fans, hum, hiss and room noise from audio or video, and writes a transcript with subtitles (SRT). |

All of them share one app, one sidebar and four color themes.

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

### YouTube channel highlights

- **Niche research**: your seed ideas are searched on YouTube (free API key); Claude Code judges each niche on demand, competition and how well small or new channels do, and lists video ideas modelled on proven outliers.
- **Topic ideas**: for your channel, what to make next: recent hits in your niche, your competitors' videos that beat their usual views, and what people type into YouTube search. Claude Code checks what is new on the web and gives each idea an angle, three points and its evidence; one click makes it a video.
- **Script**: Claude Code researches the topic on the web, notes every source, and writes the narration (hook, chapters, payoff). You read, edit and approve it: that review keeps the videos yours.
- **Voice**: scripts are written as a performance (natural rhythm, stressed words, pauses and delivery cues like [curious] or [whispers]) that Eleven v4 acts out, so it sounds like a person telling a story, not a robot reading; **Make it sound human** adds that to any script. ElevenLabs reads it with the voice you chose; each paragraph is voiced once and kept, so an edit re-voices only that paragraph. Every word comes back timed: no transcription needed.
- **Look**: flat cartoon illustrations by default (or doodle, 3D, comic, realistic), drawn by fal.ai from Claude's shot plan, with a mascot that stays the same in every scene, plus code-drawn graphics, chapter cards and a music bed. Each video has an AI budget; nothing paid runs without your click.
- **Out**: a 1920×1080 video, shorts re-laid-out in 9:16 and handed to the Shorts editor with exact captions, titles, a description with chapters, sources and credits, three thumbnails, captions (SRT), and an optional upload to your channel (private or scheduled).

## What it costs

The software is free (MIT). Everything renders on your computer. Two optional services use **your own** keys and are paid per use:

| Service | Needed for | Without it |
| --- | --- | --- |
| [Claude API](https://console.anthropic.com) (`ANTHROPIC_API_KEY`) | One-click "Edit it for me", auto-planning, post text, finding YouTube moments | Plan the edit by asking Claude Code, or edit by hand in the UI |
| [ElevenLabs](https://elevenlabs.io) (`ELEVENLABS_API_KEY`) | **Amharic transcripts** (Scribe), "Strong" noise removal, and Channel voice-overs (about 2,700 credits per 3-minute video; the free plan's audio may not be used commercially) | English transcripts run locally with whisper.cpp; Light noise removal is local |
| [fal.ai](https://fal.ai) (`FAL_KEY`) | Channel illustrations, mascot and animated clips (about $0.04 an image; about $1–2 for a 3-minute video), always within the video's AI budget | Channel videos use graphics and words only |
| [YouTube Data API](https://console.cloud.google.com) (`YOUTUBE_API_KEY`, free) | Channel niche research with real numbers (10,000 units a day) | Claude brainstorms niches without data |
| [Pexels](https://www.pexels.com/api/) / [Pixabay](https://pixabay.com/api/docs/) (free) | Stock footage for realistic channels | Illustrations and graphics only |

Motion graphics builds and all Channel writing (reports, scripts, shot plans, posts) use your Claude Code plan (not an API key).

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
2. **YouTube to Shorts**: click **From YouTube**, paste a link and press **Make shorts**. The video downloads (up to 1080p), Claude picks the moments, and each short appears in **Videos** as a draft, made one after another. Untick **Make the shorts right away** to choose the moments yourself first.
3. **Motion graphics**: create a project with your images, describe the ad, let Claude draft the 4-part brief, build, then tweak text and colors and render.
4. **YouTube channel**: open **Channels**, create your channel (audience, narrator voice, look, mascot), then **Niche research** to pick a niche, and **Topic ideas** for what to make next. **Make this video** starts the script; read and approve it, then **Finish it for me** (voice, shots, illustrations, draft, post) or go tab by tab. Make the shorts from the **Shorts** tab and upload or download from **Publish**.
5. **Audio cleaner**: drop a file, choose Light (free) or Strong (ElevenLabs), choose the language, and compare Original ↔ Cleaned with one switch.

Command-line versions exist for everything: `python shorts.py --help`, `python clipper.py --help`, `python channel.py --help`, `python graphics.py --help`, `python cleaner.py --help`.

### Working with Claude Code

`AGENTS.md` tells coding agents how each workflow runs. You can ask Claude Code to cut, plan, revise or write post text for a video by hand, which uses your Claude plan instead of API credit.

## Privacy

Humed’s AI Studio listens on `127.0.0.1` only. Your videos stay in `runs/` on your computer. Audio is sent to ElevenLabs only when you choose Amharic transcription or Strong noise removal; transcripts, keyframes and uploaded images are sent to Anthropic only when you use the Claude API features. Channel scripts go to ElevenLabs when you voice them, shot descriptions (and your mascot picture) to fal.ai when you make illustrations, and a video goes to YouTube only when you press Upload. Don't expose the app to the internet: it has no login.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A tool says it isn't installed | Run the `make` target it names, then `make doctor`. |
| YouTube download fails ("Sign in to confirm", 403) | Update the downloader: `.venv/bin/python -m pip install -U "yt-dlp[default]"`. Private, members-only and age-restricted videos can't be downloaded. |
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
clipper.py          YouTube to Shorts (moments, 9:16 crop)  clipper_app.py   its API
channel.py          YouTube channel (research → upload)     channel_app.py   its API
channel_*.py        voice (ElevenLabs), media (fal.ai, stock), render, YouTube API
graphics.py         Motion graphics engine                 graphics_app.py  its API
cleaner.py          Audio cleaner engine                   cleaner_app.py   its API
clients.py          clients and brand kits
motion/             Remotion compositions (motion/src) and the studio UI (motion/studio)
static/             Motion graphics and Audio cleaner pages, shared sidebar (tools.css, tools.js)
docs/               caption/graphics style guide, motion-graphics guide, channel style guide
tests/              offline tests: make test (no paid calls)
```

## License

[MIT](LICENSE) © 2026 Humed Muhammad. Third-party tools and models keep their own licenses. See [THIRD-PARTY.md](THIRD-PARTY.md). Note: **Remotion is free for individuals and companies of up to 3 people; larger companies need a Remotion company license.**
