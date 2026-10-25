import { linearTiming, type TransitionPresentation, type TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { EASE_IN_OUT, EASE_OUT } from "./motion";
import type { TransitionName } from "./types";

// Hand-overs between scenes, drawn with CSS only (no WebGL), so they render the same in the preview and the file.
// The exiting scene and the entering one both move: the eye follows one continuous motion.

type P = { kind: TransitionName; tall: boolean };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Frames each hand-over takes (cut has none). */
export const FRAMES: Record<TransitionName, number> = { push: 18, slide: 18, zoom: 16, blur: 18, whip: 12, wipe: 18, iris: 20, flip: 22, fade: 16, cut: 0 };

const Present: React.FC<TransitionPresentationComponentProps<P>> = ({ presentationProgress: p, presentationDirection: dir, passedProps, children }) => {
  const { kind, tall } = passedProps;
  const entering = dir === "entering";
  // Vertical films push up (like a feed); square and wide films push sideways.
  const axis = (v: number) => (tall ? `0 ${v}%` : `${v}% 0`);
  let style: React.CSSProperties = {};
  if (kind === "push" || kind === "whip") {
    const e = kind === "whip" ? EASE_IN_OUT(p) : EASE_OUT(p);
    // Both scenes move as one strip, so the old one never sits under the new one's text.
    style = entering ? { translate: axis((1 - e) * 100) } : { translate: axis(-e * 100) };
    if (kind === "whip") style.filter = `blur(${Math.sin(p * Math.PI) * 28}px)`;
    else style.filter = `blur(${Math.sin(p * Math.PI) * 3}px)`;
  } else if (kind === "slide") {
    const e = EASE_OUT(p);
    // Scenes are transparent over one backdrop: the old scene sinks and fades while the new one slides in.
    style = entering ? { translate: axis((1 - e) * 100) } : { scale: 1 - e * 0.08, opacity: interpolate(p, [0, 0.6], [1, 0], clamp), filter: `blur(${e * 6}px)` };
  } else if (kind === "zoom") {
    const e = EASE_IN_OUT(p);
    style = entering
      ? { scale: 0.82 + 0.18 * EASE_OUT(p), opacity: interpolate(p, [0.25, 0.7], [0, 1], clamp), filter: `blur(${(1 - EASE_OUT(p)) * 12}px)` }
      : { scale: 1 + e * 0.4, opacity: interpolate(p, [0.3, 0.75], [1, 0], clamp), filter: `blur(${e * 14}px)` };
  } else if (kind === "blur") {
    style = entering
      ? { opacity: interpolate(p, [0.2, 0.8], [0, 1], clamp), filter: `blur(${(1 - p) * 24}px)`, scale: 1.04 - 0.04 * EASE_OUT(p) }
      : { opacity: interpolate(p, [0.2, 0.8], [1, 0], clamp), filter: `blur(${p * 24}px)` };
  } else if (kind === "wipe") {
    const e = EASE_IN_OUT(p) * 100;
    style = entering ? { clipPath: tall ? `inset(${100 - e}% 0 0 0)` : `inset(0 0 0 ${100 - e}%)` } : { translate: axis(-EASE_IN_OUT(p) * 12) };
  } else if (kind === "iris") {
    style = entering ? { clipPath: `circle(${EASE_IN_OUT(p) * 75}% at 50% 50%)` } : { scale: 1 + EASE_IN_OUT(p) * 0.1, filter: `brightness(${1 - p * 0.5})` };
  } else if (kind === "flip") {
    const turn = EASE_IN_OUT(p) * 180;
    style = entering
      ? { rotate: tall ? `x ${turn - 180}deg` : `y ${180 - turn}deg`, opacity: p >= 0.5 ? 1 : 0, backfaceVisibility: "hidden" }
      : { rotate: tall ? `x ${turn}deg` : `y ${-turn}deg`, opacity: p < 0.5 ? 1 : 0, backfaceVisibility: "hidden" };
  } else if (kind === "fade") {
    style = { opacity: entering ? EASE_OUT(p) : 1 - p };
  }
  return (
    <AbsoluteFill style={kind === "flip" ? { perspective: 2400 } : undefined}>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

export const presentation = (kind: TransitionName, tall: boolean): TransitionPresentation<P> => ({ component: Present, props: { kind, tall } });
export const timing = (kind: TransitionName) => linearTiming({ durationInFrames: Math.max(1, FRAMES[kind]) });
