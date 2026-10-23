import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TikTokPage } from "@remotion/captions";
import { loadFont as loadSerif } from "@remotion/google-fonts/NotoSerifEthiopic";
import { letterCase, type CaptionFace } from "./captionFonts";
import { mix, onAccent } from "./colors";
import { HEADLINE_FONT } from "./fonts";
import type { Plan } from "./types";

// Six caption styles from 2026 short-form trends (word-by-word "dynamic minimalism", pills, typewriter,
// quiet serif, Devin-style glow, kinetic stack). None uses a hard black outline: depth is soft shadow.

type Token = TikTokPage["tokens"][number];
type Props = {
  page: TikTokPage;
  plan: Plan;
  style: React.CSSProperties;
  face: CaptionFace | null;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = `${loadSerif("normal", { weights: ["500"], subsets: ["ethiopic", "latin"] }).fontFamily}, Georgia, serif`;

/** Lowercase for the quiet look, but acronyms and brand caps (AI, TikTok, CEO) stay as written. */
const quietCase = (w: string) =>
  /^[A-Z0-9]{2,5}$/.test(w) || /[a-z][A-Z]/.test(w) ? w : w.toLowerCase();

const useTiming = (page: TikTokPage) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const now = page.startMs + (frame / fps) * 1000;
  /** Frames since a word started (negative before), lead in so it lands on the voice. */
  const since = (t: Token, leadMs = 60) =>
    Math.round(frame - ((t.fromMs - leadMs - page.startMs) / 1000) * fps);
  const exit = interpolate(
    frame,
    [durationInFrames - 4, durationInFrames],
    [0, 1],
    clamp,
  );
  return { frame, fps, k: width / 1080, now, since, exit };
};

const soft = (size: number, a = 0.5) =>
  `drop-shadow(0 ${size * 0.04}px ${size * 0.06}px rgba(0,0,0,${a})) drop-shadow(0 ${size * 0.1}px ${size * 0.3}px rgba(0,0,0,${a * 0.75}))`;

const faceCss = (
  face: CaptionFace | null,
  fallbackWeight = 900,
): React.CSSProperties => ({
  fontFamily: face?.family ?? HEADLINE_FONT,
  fontWeight: face?.weight ?? fallbackWeight,
  fontStretch: face?.stretch,
});

/** Dynamic minimalism: white heavy words appear as spoken; the current one is a touch larger. */
export const Karaoke: React.FC<Props> = ({ page, plan, style, face }) => {
  const { fps, k, now, since, exit } = useTiming(page);
  const size = 82 * k * (face?.scale ?? 1);
  const current = page.tokens.reduce(
    (at, t, i) => (t.fromMs <= now ? i : at),
    -1,
  );
  return (
    <div
      style={{
        ...style,
        ...faceCss(face),
        fontSize: size,
        columnGap: "0.25em",
        textTransform: letterCase(plan),
        color: "white",
        filter: soft(size),
        opacity: 1 - exit,
      }}
    >
      {page.tokens.map((t, i) => {
        const f = since(t);
        const p =
          f < 0
            ? 0
            : spring({
                frame: f,
                fps,
                config: { damping: 14, stiffness: 260 },
                durationInFrames: 7,
              });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
              scale:
                interpolate(p, [0, 1], [0.8, 1]) * (i === current ? 1.07 : 1),
              color:
                i === current
                  ? "white"
                  : mix("#ffffff", plan.highlight_color, 0.12),
            }}
          >
            {t.text.trim()}
          </span>
        );
      })}
    </div>
  );
};

/** Pill: the phrase sits on a rounded chip in the accent colour that pops in with a slight tilt. */
export const Pill: React.FC<Props> = ({ page, plan, style, face }) => {
  const { frame, fps, k, now, exit } = useTiming(page);
  const size = 64 * k * (face?.scale ?? 1);
  const p = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 220 },
    durationInFrames: 9,
  });
  const ink = onAccent(plan.highlight_color);
  return (
    <div style={{ ...style, opacity: 1 - exit }}>
      <div
        style={{
          ...faceCss(face, 800),
          fontSize: size,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.24em",
          maxWidth: 900 * k,
          padding: `${size * 0.16}px ${size * 0.42}px`,
          borderRadius: size * 0.42,
          background: `linear-gradient(180deg, ${mix(plan.highlight_color, "#ffffff", 0.18)}, ${plan.highlight_color})`,
          boxShadow: `inset 0 ${2 * k}px 0 rgba(255,255,255,.35), 0 ${14 * k}px ${36 * k}px rgba(0,0,0,.35)`,
          color: ink,
          scale: interpolate(p, [0, 1], [0.6, 1]),
          rotate: `${interpolate(p, [0, 1], [-6, -1.5])}deg`,
          opacity: interpolate(p, [0, 0.3], [0, 1], clamp),
        }}
      >
        {page.tokens.map((t, i) => (
          <span key={i} style={{ opacity: t.fromMs - 60 <= now ? 1 : 0.4 }}>
            {t.text.trim()}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Typewriter: letters type in as each word is spoken, with a caret, on a frosted dark panel. */
export const Typewriter: React.FC<Props> = ({ page, style, face, plan }) => {
  const { frame, k, now, exit } = useTiming(page);
  const size = 56 * k * (face?.scale ?? 1);
  const caret = Math.floor(frame / 8) % 2 === 0;
  let lastShown = -1;
  const words = page.tokens.map((t, i) => {
    const chars = Array.from(t.text.trim());
    const dur = Math.max(120, Math.min(t.toMs - t.fromMs, 90 * chars.length));
    const n = Math.round(
      interpolate(now - t.fromMs + 40, [0, dur], [0, chars.length], clamp),
    );
    if (n > 0) lastShown = i;
    return { chars, n };
  });
  return (
    <div style={{ ...style, opacity: 1 - exit }}>
      <div
        style={{
          ...faceCss(face, 700),
          fontSize: size,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.28em",
          maxWidth: 900 * k,
          padding: `${size * 0.28}px ${size * 0.5}px`,
          borderRadius: size * 0.36,
          background: "rgba(10,12,18,.58)",
          backdropFilter: `blur(${14 * k}px)`,
          border: `${1.5 * k}px solid rgba(255,255,255,.14)`,
          boxShadow: `0 ${14 * k}px ${40 * k}px rgba(0,0,0,.35)`,
          color: "white",
        }}
      >
        {words.map(({ chars, n }, i) => (
          <span key={i} style={{ position: "relative", whiteSpace: "pre" }}>
            <span>{chars.slice(0, n).join("")}</span>
            <span style={{ opacity: 0 }}>{chars.slice(n).join("")}</span>
            {i === lastShown && caret ? (
              <span
                style={{
                  position: "absolute",
                  left: `${(n / Math.max(1, chars.length)) * 100}%`,
                  top: "12%",
                  bottom: "8%",
                  width: Math.max(2, 5 * k),
                  background: plan.highlight_color,
                  borderRadius: 2 * k,
                }}
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Quiet: a calm serif line, lowercase, that fades up softly. For storytelling and reflective moments. */
export const Quiet: React.FC<Props> = ({ page, style }) => {
  const { frame, k, exit } = useTiming(page);
  const size = 58 * k;
  const p = interpolate(frame, [0, 10], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        ...style,
        fontFamily: SERIF,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "0.01em",
        color: "#F7F4EE",
        columnGap: "0.3em",
        filter: `${soft(size, 0.45)}${p < 1 ? ` blur(${(1 - p) * 6 * k}px)` : ""}`,
        opacity: p * (1 - exit),
        translate: `0 calc(-50% + ${(1 - p) * 14 * k}px)`,
      }}
    >
      {page.tokens.map((t, i) => (
        <span key={i}>{quietCase(t.text.trim())}</span>
      ))}
    </div>
  );
};

/** Float: uppercase with a soft glow in the accent, words drifting gently; enters from below (Devin-style). */
export const Float: React.FC<Props> = ({ page, plan, style, face }) => {
  const { frame, fps, k, since, exit } = useTiming(page);
  const size = 74 * k * (face?.scale ?? 1);
  return (
    <div
      style={{
        ...style,
        ...faceCss(face, 800),
        fontSize: size,
        textTransform: letterCase(plan),
        columnGap: "0.26em",
        opacity: 1 - exit,
      }}
    >
      {page.tokens.map((t, i) => {
        const f = since(t);
        const p =
          f < 0
            ? 0
            : spring({
                frame: f,
                fps,
                config: { damping: 200 },
                durationInFrames: 10,
              });
        const drift = Math.sin((frame + i * 9) / 14) * 5 * k;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: mix("#ffffff", plan.highlight_color, 0.15),
              textShadow: `0 0 ${size * 0.18}px ${plan.highlight_color}cc, 0 0 ${size * 0.5}px ${plan.highlight_color}66, 0 ${size * 0.06}px ${size * 0.12}px rgba(0,0,0,.45)`,
              opacity: p,
              translate: `0 ${(1 - p) * 40 * k + drift}px`,
            }}
          >
            {t.text.trim()}
          </span>
        );
      })}
    </div>
  );
};

/** Stack: one word per line, each sized to fill the same width; words slam in as spoken, the longest in the accent. */
export const Stack: React.FC<Props> = ({ page, plan, style, face }) => {
  const { fps, k, since, exit } = useTiming(page);
  const longest = page.tokens.reduce(
    (at, t, i, all) =>
      t.text.trim().length > all[at].text.trim().length ? i : at,
    0,
  );
  const width = 760 * k;
  return (
    <div
      style={{
        ...style,
        ...faceCss(face),
        flexDirection: "column",
        flexWrap: "nowrap",
        rowGap: 0,
        lineHeight: 0.98,
        textTransform: letterCase(plan),
        filter: soft(90 * k),
        opacity: 1 - exit,
      }}
    >
      {page.tokens.map((t, i) => {
        const word = t.text.trim();
        const size =
          Math.min(
            170 * k,
            width / Math.max(2.2, Array.from(word).length * 0.62),
          ) * (face?.scale ?? 1);
        const f = since(t);
        const p =
          f < 0
            ? 0
            : spring({
                frame: f,
                fps,
                config: { damping: 13, stiffness: 320 },
                durationInFrames: 7,
              });
        return (
          <div
            key={i}
            style={{
              fontSize: size,
              color:
                i === longest && page.tokens.length > 1
                  ? plan.highlight_color
                  : "white",
              opacity: interpolate(p, [0, 0.3], [0, 1], clamp),
              scale: interpolate(p, [0, 1], [1.35, 1]),
            }}
          >
            {word}
          </div>
        );
      })}
    </div>
  );
};
