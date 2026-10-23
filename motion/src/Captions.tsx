import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { captionFace, letterCase } from "./captionFonts";
import {
  Float,
  Karaoke,
  Pill,
  Sweep,
  waveLetter,
  Quiet,
  Stack,
  Typewriter,
} from "./CaptionStyles";
import { chrome, glass, mix, onAccent } from "./colors";
import { ACCENT_FONT, BODY_FONT, HEADLINE_FONT } from "./fonts";
import { type Reframe, reframeY } from "./tracking";
import type { Plan, Tracks } from "./types";

// How long a page may combine words: bold shows 1-3 words, minimal shows phrases.
// A page never lingers longer than this after it starts (whisper stretches words over silence).
const MAX_PAGE_MS = 4000;
const PAGE_MS = {
  duo: 1300,
  karaoke: 800,
  pill: 700,
  typewriter: 1100,
  quiet: 1600,
  float: 900,
  stack: 600,
  clean: 900,
  editorial: 1100,
  rise: 1100,
  bold: 450,
  boxed: 800,
  minimal: 1400,
  sweep: 1300,
} as const;

// Rise: each word slides up from behind its own baseline as it is spoken (expo-out, no blur).
const RISE = Easing.bezier(0.16, 1, 0.3, 1);
const RISE_MS = 520; // one word's travel
const RISE_LEAD_MS = 90; // starts just before the word is heard, so it lands on the voice
const RISE_EXIT = 7; // frames: the line lifts away at the end of its page

/** Lowercase word without punctuation, so "mistakes," matches "mistakes". */
const norm = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, "");

type Preset = keyof typeof PAGE_MS;
const STYLES = {
  karaoke: Karaoke,
  pill: Pill,
  typewriter: Typewriter,
  quiet: Quiet,
  float: Float,
  stack: Stack,
  sweep: Sweep,
};

/** Split a page into two lines of similar length (line 1 a little shorter, like a headline). */
const twoLines = (tokens: TikTokPage["tokens"]) => {
  if (tokens.length < 2) return [tokens, []];
  const len = tokens.map((t) => t.text.trim().length);
  const total = len.reduce((a, b) => a + b, 0);
  let best = 1;
  let score = Infinity;
  for (let i = 1, left = len[0]; i < tokens.length; left += len[i], i++) {
    const s = Math.abs(left - (total - left)) + (left > total - left ? 1 : 0);
    if (s < score) [best, score] = [i, s];
  }
  return [tokens.slice(0, best), tokens.slice(best)];
};

/**
 * Duo: two short lines in a heavy face, line 1 white and line 2 in the accent, with a dark outline and drop
 * shadow so they read on any footage. Motion: pop (the phrase pops in), word (words appear as spoken) or
 * rise (words slide up from their baseline as spoken).
 */
const Duo: React.FC<{
  page: TikTokPage;
  plan: Plan;
  style: React.CSSProperties;
}> = ({ page, plan, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const k = width / 1080;
  const face = captionFace(plan.caption_font ?? "noto_black") ?? {
    family: HEADLINE_FONT,
    weight: 900,
    scale: 1,
  };
  const motion = plan.caption_motion ?? "pop";
  const slow = plan.caption_speed ?? 1; // the creator's animation speed: >1 slower, <1 faster
  const now = page.startMs + (frame / fps) * 1000;
  const size = 86 * k * face.scale;
  const lines = twoLines(page.tokens);
  const pop = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 240 },
    durationInFrames: Math.round(10 * slow),
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 4, durationInFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const word = (t: TikTokPage["tokens"][number], color: string, i: number) => {
    const local = Math.round(
      frame - ((t.fromMs - 60 - page.startMs) / 1000) * fps,
    );
    const p =
      motion === "rise"
        ? interpolate(now - t.fromMs + RISE_LEAD_MS, [0, RISE_MS * slow], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: RISE,
          })
        : motion === "word"
          ? local < 0
            ? 0
            : spring({
                frame: local,
                fps,
                config: { damping: 12, stiffness: 300 },
                durationInFrames: Math.round(7 * slow),
              })
          : 1;
    // Glass: gradient fill clipped to the letters, a thin light rim, and a shine band that sweeps across
    // once as the word lands. Depth comes from soft shadows, never a hard black outline.
    const shine = interpolate(local, [4, 22], [130, -30], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
    const kind = plan.caption_fill ?? "glass";
    const fill: React.CSSProperties =
      kind === "solid"
        ? { color }
        : kind === "glow"
          ? {
              color: mix(color, "#ffffff", 0.35),
              textShadow: `0 0 ${size * 0.12}px ${color}, 0 0 ${size * 0.4}px ${color}aa`,
            }
          : {
              backgroundImage: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,.75) 50%, transparent 60%), ${kind === "chrome" ? chrome(color) : glass(color)}`,
              backgroundSize: "300% 100%, 100% 100%",
              backgroundPosition: `${shine}% 0, 0 0`,
              backgroundRepeat: "no-repeat",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              WebkitTextStroke: `${Math.max(1, size * 0.018)}px rgba(255,255,255,.45)`,
            };
    // Lift: the word's letters rise one after another as it is spoken, each carrying the fill.
    if (motion === "lift")
      return (
        <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {Array.from(t.text.trim()).map((c, j) => (
            <span key={j} style={{ ...fill, ...waveLetter(now, t.fromMs, j, slow) }}>
              {c}
            </span>
          ))}
        </span>
      );
    const inner = (
      <span
        style={{
          display: "inline-block",
          ...fill,
          opacity:
            motion === "pop"
              ? 1
              : interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          scale: motion === "word" ? interpolate(p, [0, 1], [0.55, 1]) : 1,
          translate: motion === "rise" ? `0 ${(1 - p) * 110}%` : undefined,
        }}
      >
        {t.text.trim()}
      </span>
    );
    // Rise is masked just below the baseline so words come up from behind it; the outline stays visible above.
    return motion === "rise" ? (
      <span
        key={i}
        style={{
          display: "inline-block",
          clipPath: p < 1 ? "inset(-60% -20% -0.18em -20%)" : undefined,
        }}
      >
        {inner}
      </span>
    ) : (
      <span key={i} style={{ display: "inline-block" }}>
        {inner}
      </span>
    );
  };
  return (
    <div
      style={{
        ...style,
        flexDirection: "column",
        flexWrap: "nowrap",
        rowGap: 0,
        fontFamily: face.family,
        fontWeight: face.weight,
        fontStretch: face.stretch,
        fontSize: size,
        lineHeight: 1.1,
        textAlign: "center",
        textTransform: letterCase(plan),
        // Readability on bright footage from soft depth: a tight contact shadow and a wide soft one.
        filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.05}px rgba(0,0,0,.55)) drop-shadow(0 ${size * 0.1}px ${size * 0.3}px rgba(0,0,0,.4))`,
        opacity:
          (motion === "pop"
            ? interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" })
            : 1) *
          (1 - exit),
        scale:
          (motion === "pop" ? interpolate(pop, [0, 1], [0.7, 1]) : 1) *
          (1 - exit * 0.06),
      }}
    >
      {lines
        .filter((l) => l.length)
        .map((line, n) => (
          <div
            key={n}
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              columnGap: "0.28em",
              maxWidth: 940 * k,
              // The accent line blooms softly in its own colour, as if lit from inside.
              filter:
                n === 1 && plan.caption_fill !== "solid"
                  ? `drop-shadow(0 0 ${size * 0.22}px ${plan.highlight_color}66)`
                  : undefined,
            }}
          >
            {line.map((t, i) =>
              word(t, n === 1 ? plan.highlight_color : "white", i),
            )}
          </div>
        ))}
    </div>
  );
};

const Page: React.FC<{
  page: TikTokPage;
  preset: Preset;
  plan: Plan;
  y: number;
}> = ({ page, preset, plan, y }) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const k = width / 1080;
  const now = page.startMs + (frame / fps) * 1000;
  // The chosen caption face replaces each preset's own sans; the italic serif accent stays.
  const face = captionFace(plan.caption_font);
  const BODY = face?.family ?? BODY_FONT;
  const HEADLINE = face?.family ?? HEADLINE_FONT;
  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 220 },
    durationInFrames: 8,
  });

  const container: React.CSSProperties = {
    position: "absolute",
    left: 80 * k,
    right: 80 * k,
    top: `${y * 100}%`,
    translate: "0 -50%",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: "0.4em",
    rowGap: "0.08em",
    lineHeight: 1.12,
  };

  if (preset === "duo")
    return <Duo page={page} plan={plan} style={container} />;
  if (preset in STYLES) {
    const Style = STYLES[preset as keyof typeof STYLES];
    return (
      <Style
        page={page}
        plan={plan}
        style={container}
        face={captionFace(plan.caption_font)}
      />
    );
  }

  if (preset === "clean") {
    // Bold white phrase on a dark rounded box; the word being said turns accent-coloured with a small pop.
    const ink = onAccent(plan.highlight_color);
    const current = page.tokens.reduce(
      (at, t, i) => (t.fromMs <= now ? i : at),
      -1,
    );
    return (
      <div
        style={{
          ...container,
          fontSize: 54 * k, // gaps below are measured in this size
          opacity: interpolate(enter, [0, 1], [0, 1]),
          scale: interpolate(enter, [0, 1], [0.9, 1]),
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            columnGap: "0.18em",
            rowGap: "0.12em",
            maxWidth: 900 * k,
            padding: `${14 * k}px ${22 * k}px`,
            borderRadius: 24 * k,
            background: "rgba(13,15,24,.86)",
            boxShadow: `0 ${12 * k}px ${32 * k}px rgba(0,0,0,.35)`,
            fontFamily: BODY,
            fontWeight: 800,
            lineHeight: 1.18,
            color: "white",
          }}
        >
          {page.tokens.map((t, i) => {
            const on = i === current;
            const hit = spring({
              frame: Math.round(
                frame - ((t.fromMs - page.startMs) / 1000) * fps,
              ),
              fps,
              config: { damping: 14, stiffness: 300 },
              durationInFrames: 7,
            });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  padding: `0 ${8 * k}px`,
                  borderRadius: 12 * k,
                  background: on ? plan.highlight_color : "transparent",
                  color: on ? ink : "white",
                  scale: on ? interpolate(hit, [0, 1], [0.92, 1.04]) : 1,
                }}
              >
                {t.text.trim()}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (preset === "rise") {
    // Same look as editorial, but each word rises into place from behind an invisible line as it is
    // spoken; the space is reserved from the start so the line never shifts. At the end the line lifts off.
    const stress = new Set(
      plan.emphasis
        .flatMap((p) => p.split(/\s+/))
        .map(norm)
        .filter(Boolean),
    );
    const exit = interpolate(
      frame,
      [durationInFrames - RISE_EXIT, durationInFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      },
    );
    const halo = `0 0 ${20 * k}px rgba(0,0,0,.6), 0 ${3 * k}px ${8 * k}px rgba(0,0,0,.5)`;
    return (
      <div
        style={{
          ...container,
          fontSize: 60 * k, // the gap below is measured in this size
          columnGap: "0.28em",
          rowGap: "0.12em",
          alignItems: "baseline",
          lineHeight: 1.05,
          opacity: 1 - exit,
          translate: `0 calc(-50% - ${exit * 22 * k}px)`,
        }}
      >
        {page.tokens.map((t, i) => {
          const word = t.text.trim();
          const accent = stress.size ? stress.has(norm(word)) : /\d/.test(word);
          const p = interpolate(
            now - t.fromMs + RISE_LEAD_MS,
            [0, RISE_MS * (plan.caption_speed ?? 1)],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: RISE,
            },
          );
          return (
            // The mask: clips only below the line (with room for descenders), never the glow above or beside.
            <span
              key={i}
              style={{
                display: "inline-block",
                clipPath: p < 1 ? "inset(-60% -30% -0.22em -30%)" : undefined,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontFamily: accent ? ACCENT_FONT : BODY,
                  fontStyle: accent ? "italic" : "normal",
                  fontWeight: accent ? 400 : 700,
                  fontSize: (accent ? 104 : 60) * k,
                  color: accent ? plan.highlight_color : "white",
                  opacity: interpolate(p, [0, 0.35], [0, 1], {
                    extrapolateRight: "clamp",
                  }),
                  translate: `0 ${(1 - p) * 118}%`,
                  rotate: `${(1 - p) * 4}deg`,
                  transformOrigin: "0% 100%",
                  textShadow: accent
                    ? `0 0 ${28 * k}px ${plan.highlight_color}55, ${halo}`
                    : halo,
                }}
              >
                {word}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  if (preset === "editorial") {
    // The whole phrase is on screen at once; words light up as they are spoken. Stressed words use the
    // big italic serif accent. A soft dark halo keeps everything readable over bright footage.
    const stress = new Set(
      plan.emphasis
        .flatMap((p) => p.split(/\s+/))
        .map(norm)
        .filter(Boolean),
    );
    const enterPage = interpolate(frame, [0, 6], [0, 1], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    const halo = `0 0 ${20 * k}px rgba(0,0,0,.7), 0 ${3 * k}px ${8 * k}px rgba(0,0,0,.55)`;
    return (
      <div
        style={{
          ...container,
          fontSize: 60 * k, // the gap below is measured in this size
          columnGap: "0.28em",
          rowGap: "0.12em",
          alignItems: "baseline",
          lineHeight: 1.05,
          opacity: enterPage,
          filter:
            enterPage < 1 ? `blur(${(1 - enterPage) * 8 * k}px)` : undefined,
          translate: `0 calc(-50% + ${(1 - enterPage) * 16 * k}px)`,
        }}
      >
        {page.tokens.map((t, i) => {
          const word = t.text.trim();
          const accent = stress.size ? stress.has(norm(word)) : /\d/.test(word);
          const said = interpolate(now - t.fromMs, [-60, 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontFamily: accent ? ACCENT_FONT : BODY,
                fontStyle: accent ? "italic" : "normal",
                fontWeight: accent ? 400 : 700,
                fontSize: (accent ? 104 : 60) * k,
                color: accent ? plan.highlight_color : "white",
                opacity: 0.42 + 0.58 * said,
                textShadow: accent
                  ? `0 0 ${28 * k}px ${plan.highlight_color}55, ${halo}`
                  : halo,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  }

  if (preset === "minimal") {
    return (
      <div
        style={{
          ...container,
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 54 * k,
          color: "white",
          textShadow: `0 ${3 * k}px ${14 * k}px rgba(0,0,0,.65)`,
          opacity: interpolate(frame, [0, 5], [0, 1], {
            extrapolateRight: "clamp",
          }),
          translate: `0 calc(-50% + ${interpolate(frame, [0, 8], [12 * k, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })}px)`,
        }}
      >
        {page.tokens.map((t, i) => (
          <span key={i} style={{ opacity: t.fromMs <= now ? 1 : 0.55 }}>
            {t.text.trim()}
          </span>
        ))}
      </div>
    );
  }

  const boxed = preset === "boxed";
  return (
    <div
      style={{
        ...container,
        fontFamily: HEADLINE,
        fontWeight: boxed ? 800 : 900,
        fontSize: (boxed ? 66 : 84) * k,
        textTransform: letterCase(plan),
        color: "white",
        scale: interpolate(enter, [0, 1], [0.82, 1]),
      }}
    >
      {page.tokens.map((t, i) => {
        const active = t.fromMs <= now && t.toMs > now;
        const pop = spring({
          frame: Math.round(frame - ((t.fromMs - page.startMs) / 1000) * fps),
          fps,
          config: { damping: 12, stiffness: 260 },
          durationInFrames: 6,
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              padding: boxed ? `${2 * k}px ${14 * k}px` : 0,
              borderRadius: 12 * k,
              background:
                boxed && active ? plan.highlight_color : "transparent",
              color: active ? (boxed ? "#111" : plan.highlight_color) : "white",
              WebkitTextStroke:
                boxed && active ? 0 : `${(boxed ? 7 : 11) * k}px black`,
              paintOrder: "stroke fill",
              textShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,.45)`,
              // Small scale + lift: a large scale on long words eats the gap.
              scale: active ? interpolate(pop, [0, 1], [1, 1.05]) : 1,
              translate:
                active && !boxed
                  ? `0 ${interpolate(pop, [0, 1], [0, -6 * k])}px`
                  : undefined,
            }}
          >
            {t.text.trim()}
          </span>
        );
      })}
    </div>
  );
};

// Face placement (2026 short-form guides: keep captions off the eyes and mouth, out of the bottom ~20% that
// TikTok/Reels/Shorts cover with buttons and the top ~12%): the caption's top edge sits just under the chin.
const SAFE_TOP = 0.14;
const SAFE_BOTTOM = 0.8;
const CHIN_GAP = 0.015;
const MOVE_AT_LEAST = 0.025; // ignore small head movements, so captions stay put
/** Rough half-height of each style's caption block, as a share of the frame height. */
const HALF: Partial<Record<Preset, number>> = {
  duo: 0.055,
  stack: 0.11,
  editorial: 0.05,
  rise: 0.05,
  bold: 0.05,
  pill: 0.04,
};

const facePlaces = (
  pages: TikTokPage[],
  tracks: Tracks | undefined,
  plan: Plan,
  fps: number,
  reframe?: Reframe,
) => {
  const half = HALF[plan.caption_preset as Preset] ?? 0.04;
  const scale = plan.background?.scale ?? 1; // a scaled-up cutout grows from the bottom edge
  let last: number | null = null;
  return pages.map((page) => {
    if (plan.caption_place === "fixed" || !tracks?.face?.length)
      return plan.caption_y;
    const from = Math.round((page.startMs / 1000) * fps);
    const chins: number[] = [];
    for (let f = from; f < from + Math.max(1, Math.round(1.5 * fps)); f++) {
      const s = tracks.face[f];
      if (!s) continue;
      const chin = 1 - (1 - (s[1] + s[2] * 0.5)) * scale;
      chins.push(reframe ? reframeY(reframe, chin) : chin);
    }
    if (!chins.length) return last ?? plan.caption_y;
    chins.sort((a, b) => a - b);
    const chin = chins[Math.floor(chins.length / 2)];
    const y = Math.min(
      SAFE_BOTTOM - half,
      Math.max(SAFE_TOP + half, chin + CHIN_GAP + half),
    );
    if (last === null || Math.abs(y - last) >= MOVE_AT_LEAST) last = y;
    return last;
  });
};

// While a full-screen, dimmed or split graphic is up, captions drop to the bottom so they never cover it
// (or, in split view, the speaker's face).
const LOW_Y = 0.88;

export const Captions: React.FC<{
  captions: Caption[];
  plan: Plan;
  tracks?: Tracks;
  reframe?: Reframe;
}> = ({ captions, plan, tracks, reframe }) => {
  const lowered = (ms: number) =>
    plan.events.some(
      (e) =>
        e.type === "card" &&
        e.scene !== "overlay" &&
        e.start * 1000 - 300 <= ms &&
        ms < e.end * 1000,
    );
  const { fps } = useVideoConfig();
  const preset = plan.caption_preset;
  // Words spoken inside a no_captions window are left out, so pages form from the remaining words.
  const hidden = plan.events
    .filter((e) => e.type === "no_captions")
    .map((e) => [e.start * 1000, e.end * 1000]);
  const pages = useMemo(
    () =>
      preset === "none"
        ? []
        : createTikTokStyleCaptions({
            captions: captions.filter(
              (c) => !hidden.some(([s, e]) => s <= c.startMs && c.startMs < e),
            ),
            combineTokensWithinMilliseconds: PAGE_MS[preset],
          }).pages,
    [captions, preset, plan.events],
  );
  const places = useMemo(
    () => facePlaces(pages, tracks, plan, fps, reframe),
    [pages, tracks, plan, fps, reframe],
  );
  if (preset === "none") return null;
  return (
    <AbsoluteFill>
      {pages.map((page, i) => {
        const next = pages[i + 1];
        const from = Math.round((page.startMs / 1000) * fps);
        const endMs = Math.min(
          next ? next.startMs : Infinity,
          page.startMs + page.durationMs + 600,
          page.startMs + MAX_PAGE_MS,
          ...hidden.map(([s]) => s).filter((s) => s > page.startMs),
        );
        const until = Math.round((endMs / 1000) * fps);
        if (until <= from) return null;
        return (
          <Sequence
            key={i}
            from={from}
            durationInFrames={until - from}
            layout="none"
          >
            <Page
              page={page}
              preset={preset}
              plan={plan}
              y={lowered(page.startMs) ? LOW_Y : places[i]}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
