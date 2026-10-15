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
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import type { Plan } from "./types";

const { fontFamily: montserrat } = loadMontserrat("normal", {
  weights: ["800", "900"],
  subsets: ["latin"],
});
const { fontFamily: inter } = loadInter("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
});
export const HEADLINE_FONT = `${montserrat}, "Geeza Pro", sans-serif`;

// How long a page may combine words: bold shows 1-3 words, minimal shows phrases.
// A page never lingers longer than this after it starts (whisper stretches words over silence).
const MAX_PAGE_MS = 4000;
const PAGE_MS = { bold: 450, boxed: 800, minimal: 1400 } as const;

type Preset = keyof typeof PAGE_MS;

const Page: React.FC<{ page: TikTokPage; preset: Preset; plan: Plan }> = ({
  page,
  preset,
  plan,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
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
    top: `${plan.caption_y * 100}%`,
    translate: "0 -50%",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: "0.4em",
    rowGap: "0.08em",
    lineHeight: 1.12,
  };

  if (preset === "minimal") {
    return (
      <div
        style={{
          ...container,
          fontFamily: `${inter}, "Geeza Pro", sans-serif`,
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

export const Captions: React.FC<{ captions: Caption[]; plan: Plan }> = ({
  captions,
  plan,
}) => {
  const { fps } = useVideoConfig();
  const preset = plan.caption_preset;
  const pages = useMemo(
    () =>
      preset === "none"
        ? []
        : createTikTokStyleCaptions({
            captions,
            combineTokensWithinMilliseconds: PAGE_MS[preset],
          }).pages,
    [captions, preset],
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
            <Page page={page} preset={preset} plan={plan} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
