# Channel style guide

Claude Code reads this before it writes anything for the **Channel** tool (`channel.py`, `/shorts?view=channel`).
These videos are faceless, narrated by an ElevenLabs voice and published on YouTube in English. YouTube removes
monetization from whole channels that post "inauthentic content": mass-produced, template-like, low-effort videos.
Every rule below exists to make each video worth watching on its own merits.

## 1. Niche research

You get a YouTube scan: per seed idea, the number of videos, median views, how many hits came from small (< 50K subs)
or young (< 1 year) channels, how concentrated the views are in the top 3 channels, and the strongest outliers
(a video with many times its channel's median views, or many times its subscriber count).

- **Demand** = people watch this topic: many videos with healthy median views, recent hits.
- **Room for a newcomer** = small and young channels get hits, and the top 3 channels do not hold most of the views.
  A niche where only giant channels win is "avoid" for a new channel, however popular.
- **Outliers are the evidence.** A topic is proven when a small channel's video beat its own median by 3× or more.
  Base every topic idea on one or more outliers and cite their ids.
- **Faceless fit**: can it be explained with narration over footage, diagrams and text? Topics that need a host's face,
  live gameplay commentary, or reaction to other people's videos are a poor fit.
- **RPM** (what a channel earns per 1,000 views) is an *estimate*: give a range and say so. Finance, business, software,
  and education tend to pay more than entertainment and gaming. Never present RPM as data.
- **Policy risk**: medical, legal and financial advice voiced by an AI narrator is high risk (YouTube treats AI personas on
  sensitive subjects as inauthentic). True crime and news need careful sourcing. Re-uploads, compilations and "reaction"
  formats are not allowed for this tool.
- Without a scan (no YouTube key), say clearly that the report is a brainstorm without data.

Topic titles copy the *pattern* of what worked (a number, a question, a surprising claim, a clear payoff), never the
exact title. 40–70 characters, no clickbait the video cannot pay off.

## 1b. Topic research (what an existing channel makes next)

You get the channel's profile, the videos it already has, a scan of recent videos for its niche (or the creator's
focus), its competitors' recent uploads scored against their usual views, and what people type into YouTube search.

- **Proven demand first.** A topic is strong when a small or similar-sized channel's video beat its own usual views by
  3× or more in the last few months. Competitor outliers are the clearest signal: their audience is this channel's audience.
- **Searchable.** Prefer topics that answer a phrase people type (the search list); say which phrases in `searches`.
  A good title contains the words of the search, in a more curious form.
- **Evergreen and trending.** Most ideas should be evergreen (still watched next year). Add a few trending ones only when
  something real is happening (a discovery, a release, an anniversary in the coming weeks) and link to it. Never use
  tragedies, deaths or disasters for views.
- **Fit the format.** One question, three clear points, one payoff: it must work in the channel's length (3 minutes by
  default) with illustrations and simple graphics. Topics that need footage of real events or real people do not fit.
- **A new angle.** Never repeat a video the channel already has. For each idea, say what it adds that the existing
  videos do not: a clearer explanation, a surprising comparison, newer facts, a question nobody answered.
- **Score** = how many views a small channel can expect, from the evidence; trending ideas decay fast, so score them
  for this week, not this year.

## 2. Script

- Length: about 150 spoken words per minute. Channels default to 3 minutes ≈ 450 words; a 10-minute video ≈ 1,500 words.
  In 3 minutes every sentence must earn its place: one clear question, three strong points, one payoff.
- **Hook (first 15 seconds)**: open on the most surprising true thing in the video, or the question the viewer already has.
  No "Hey guys", no channel intro, no "in this video we will".
- **Promise** (by 30 s): say what the viewer gets by the end.
- **Chapters**: 3 for a video under 5 minutes, 4–7 for a longer one, each one idea, each with a short title (used for YouTube chapters). End each chapter on a reason to
  keep watching (an open question, "but that's not the strangest part").
- **Re-hook** near the middle (videos of 5 minutes or more): a turn, a surprise, or the best example saved for this point.
- **Payoff and outro**: deliver the promise, then one sentence inviting a comment (a question) and a subscribe line of at
  most one sentence. No long goodbyes.
- Write for the ear: short sentences, one idea each, concrete examples, numbers said the way people say them
  ("about two million", not "2,034,112"). Spell out symbols and abbreviations the voice could misread.
- **Facts**: research before writing. Every number, date, name and quote must come from a source you read; list sources
  in `sources.md` with the claim each one supports. If you cannot confirm something, leave it out. Never invent quotes,
  statistics, studies or people.
- Add something the top videos on the topic do not have: a clearer explanation, a better example, a fresh angle, or
  newer information. Say in `sources.md` under "## Our angle" what it is.
- No medical, legal or financial advice. Explain, do not prescribe ("here is how index funds work", not "buy this").
- Paragraphs of 2–5 sentences; each paragraph is voiced in one call, so a paragraph should read as one breath of thought.

## 3. Voice and delivery: sound like a person, not a robot

The narrator is an ElevenLabs voice. A flat, correct script read word for word sounds like a machine; the same facts
written the way a person *tells* them sound human. Write a performance, not an article.

**How people talk**
- Contractions always: it's, don't, you'd, that's. "It is not" sounds like a robot.
- Mix sentence lengths. A long sentence that builds up, then a short one. Like this.
- Talk to one viewer: "you", "imagine", "picture this". Ask them a question now and then, and answer it.
- Little spoken connectors where a person would use them: "okay, so", "here's the thing", "and honestly?", "wait, it gets weirder".
  One or two per minute, not every line.
- Say numbers the way people say them ("about two million", "thirty-three centimeters, that's about a foot").

**Punctuation is direction** (every model follows it)
- `…` an ellipsis gives a beat of suspense before a reveal: "and it ran… faster."
- `—` a dash is a turn or an aside: "Time slows down — and we can measure it."
- `?` lifts the voice; use real questions. `!` sparingly, for real excitement.
- CAPS on ONE word stresses it ("it ran FASTER"). Never more than one per sentence, never whole sentences.
- Commas where you would breathe.

**Delivery cues** (Eleven v3 and v4 perform these; other models leave them out, except pauses)
Square-bracket tags placed right before the words they colour. About one every two to four sentences, never more than two
in a row. Choose ones that suit the narrator and the moment:
- curiosity and wonder: `[curious]`, `[amazed]`, `[thoughtful]`, `[intrigued]`
- energy: `[excited]`, `[playfully]`, `[mischievously]`, `[warmly]`
- weight: `[serious]`, `[sighs]`, `[quietly]`, `[whispers]` (a secret, a twist, something eerie)
- reactions: `[laughs softly]`, `[chuckles]`, `[gasps]`, `[exhales]`
- timing: `[short pause]`, `[pause]`, `[long pause]` (before a reveal or after a big number)

Never sound effects or music (`[applause]`, `[music]`, `[explosion]`): the edit adds those. Never stage directions in
round brackets: they are read aloud. Tags are not words: they do not count toward the length and the captions skip them.

**Example.** Flat:
> Your head is ticking faster than your feet. Not as a metaphor. In twenty ten, scientists raised a clock by just thirty
> three centimeters and it ran faster. They measured it.

Performed:
> Your head is ticking faster than your feet. [short pause] No, really — not as a metaphor. [curious] Back in twenty ten,
> scientists lifted a clock by just thirty-three centimeters… about one foot… and it ran FASTER. [amazed] They actually
> measured it.

Keep each paragraph a complete thought of 250–600 characters: the voice needs some context to act well, and each
paragraph is voiced in one go.

## 4. Scenes and visuals

Shots follow the narration. Each shot is 2.5–10 seconds; change something on screen at least every 3–7 seconds.
Each channel has a **look** (its profile): an art style (flat illustrated by default; also doodle, 3D cartoon, comic,
or realistic), an optional **mascot**, and a graphic style for the code-drawn shots (cartoon by default).

- `image`: an illustration in the channel's art style, shown with a slow camera move. **The main kind of shot for an
  illustrated channel.** The prompt describes only the scene (subject, action, setting, composition, mood): the style
  words are added automatically, so never write "flat vector" or "cartoon" yourself. No text, letters or logos in images,
  no real people's likeness. Describe recurring places and objects the same way each time so they look consistent.
- `mascot: true` on an image or clip puts the channel's mascot in the scene, kept identical from its reference image.
  Say what it does (points at, reacts to, explains, holds, walks through). About a third of the illustrated shots:
  the hook, reactions, explanations, the outro. Not in every shot: the topic is the star.
- `ai_clip`: the same kind of illustration, animated for 5 seconds (`animate` says how it moves). Expensive: the hook
  and one or two hero moments, within the video's AI budget.
- `graphic`: a Motion Studio scene template (numbers, charts, lists, comparisons, steps, quotes). Use one for every
  number, comparison, list or step the narration says; on-screen words come from the narration, short. Always give it
  its own words in `props`.
- `chapter`: a chapter title card at the start of each chapter; the next shot starts about 3 seconds later.
- `stock`: real footage from Pexels/Pixabay, only for channels whose look includes stock (realistic). The `query` is
  2–4 concrete, filmable words ("city traffic night"), never abstract ideas ("success").
- Vary the mix: never four shots of one kind in a row; a graphic wherever a number or list is spoken.

## 5. Shorts from the long video

1–2 moments from a video under 2½ minutes, 2–3 from one under 5 minutes, 3–5 from a longer one; each 20–60 seconds and
standing alone: it opens on a hook sentence, holds one idea, and ends on its payoff.
No moment that needs earlier context. The hook text is at most 8 words.

## 6. Post (title, description, tags)

- 3 title options, 40–70 characters, honest to the video.
- Description: two sentences that restate the hook and promise, then chapters (`0:00 Intro` first, at least 3 chapters,
  each at least 10 seconds), then sources, then stock footage credits, then the line
  "Narration voiced with AI (ElevenLabs). Script researched and written for this channel."
- 8–15 tags; one pinned comment that asks a question about the topic.
