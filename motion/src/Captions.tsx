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
import { onAccent } from "./colors";
import { ACCENT_FONT, BODY_FONT, HEADLINE_FONT } from "./fonts";
import type { Plan } from "./types";

// How long a page may combine words: bold shows 1-3 words, minimal shows phrases.
// A page never lingers longer than this after it starts (whisper stretches words over silence).
const MAX_PAGE_MS = 4000;
const PAGE_MS = {
  clean: 900,
  editorial: 1100,
  rise: 1100,
  bold: 450,
  boxed: 800,
  minimal: 1400,
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
            fontFamily: BODY_FONT,
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
            [0, RISE_MS],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: RISE },
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
                  fontFamily: accent ? ACCENT_FONT : BODY_FONT,
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
                fontFamily: accent ? ACCENT_FONT : BODY_FONT,
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
          fontFamily: BODY_FONT,
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
        fontFamily: HEADLINE_FONT,
        fontWeight: boxed ? 800 : 900,
        fontSize: (boxed ? 66 : 84) * k,
        textTransform: "uppercase",
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

// While a full-screen, dimmed or split graphic is up, captions drop to the bottom so they never cover it
// (or, in split view, the speaker's face).
const LOW_Y = 0.88;

export const Captions: React.FC<{ captions: Caption[]; plan: Plan }> = ({
  captions,
  plan,
}) => {
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
              y={lowered(page.startMs) ? LOW_Y : plan.caption_y}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
