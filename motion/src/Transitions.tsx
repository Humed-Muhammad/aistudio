import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { Plan, ShortEvent } from "./types";

// What a `flash` event looks like: chosen once per video (plan.transition), or per switch (event.effect). Each effect peaks at the event's
// start, where look switches begin, so the switch hides inside it. Picture effects (blur, whip) move only the
// footage layer; light effects (bloom, leak, dip, flash) are drawn over it.

export type Transition = NonNullable<Plan["transition"]>;

/** Frames before and after the peak each effect lasts. */
const SPAN: Record<Transition, [number, number]> = {
  bloom: [6, 12],
  leak: [8, 16],
  blur: [5, 8],
  whip: [5, 6],
  dip: [5, 7],
  flash: [0, 9],
  none: [0, 0],
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The effect playing at this frame (a switch's own effect, else the video's): 0 → 1 at the peak → 0, eased;
 * t = frames from the peak.
 */
const active = (events: ShortEvent[], video: Transition, frame: number, fps: number) => {
  for (const e of events) {
    if (e.type !== "flash") continue;
    const kind = e.effect || video;
    const [before, after] = SPAN[kind];
    const t = frame - Math.round(e.start * fps);
    if (t >= -before && t <= after && kind !== "none") {
      const p =
        t < 0
          ? interpolate(t, [-before, 0], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) })
          : interpolate(t, [0, after], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
      return { p, t, kind };
    }
  }
  return null;
};

/** Motion on the footage layer (scale, slide, blur) for blur and whip. */
export const transitionMotion = (
  events: ShortEvent[],
  kind: Transition,
  frame: number,
  fps: number,
  k: number,
): { filter?: string; scale?: number; x?: number } => {
  const hit = active(events, kind, frame, fps);
  if (!hit) return {};
  kind = hit.kind;
  if (kind === "blur") return { filter: `blur(${hit.p * 9 * k}px) brightness(${1 + hit.p * 0.12})`, scale: 1 + hit.p * 0.06 };
  // Whip: the picture slides out one way and arrives from the other, streaked by blur.
  if (kind === "whip") return { filter: `blur(${hit.p * 16 * k}px)`, x: (hit.t < 0 ? -1 : 1) * hit.p * 0.09 };
  return {};
};

/** Light drawn over the picture for bloom, leak, dip and flash. */
export const TransitionLight: React.FC<{ events: ShortEvent[]; kind: Transition; frame: number; fps: number }> = ({ events, kind, frame, fps }) => {
  const hit = active(events, kind, frame, fps);
  if (!hit) return null;
  const { p, t } = hit;
  kind = hit.kind;
  if (kind === "flash")
    return <AbsoluteFill style={{ backgroundColor: "white", opacity: interpolate(t, [0, 2, 9], [0, 0.85, 0], clamp) }} />;
  if (kind === "dip") return <AbsoluteFill style={{ backgroundColor: "#050507", opacity: p * 0.9 }} />;
  if (kind === "bloom")
    // Soft over-exposure: a warm glow blooming from the middle, like a lens catching a light.
    return (
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: p * 0.75,
          background: "radial-gradient(70% 50% at 50% 42%, rgba(255,250,242,.95) 0%, rgba(255,240,225,.55) 40%, rgba(255,235,215,.15) 70%, transparent 100%)",
        }}
      />
    );
  if (kind === "leak") {
    // Film light leak: warm orange and pink glows sweeping across the frame.
    const sweep = interpolate(t, [-SPAN.leak[0], SPAN.leak[1]], [-30, 120], clamp);
    return (
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: Math.min(1, p * 1.2),
          background: [
            `radial-gradient(45% 60% at ${sweep}% 35%, rgba(255,138,61,1), rgba(255,138,61,.4) 45%, transparent 75%)`,
            `radial-gradient(40% 55% at ${sweep - 25}% 70%, rgba(255,95,162,.85), transparent 72%)`,
            `radial-gradient(60% 40% at ${sweep + 10}% 10%, rgba(255,214,170,.7), transparent 70%)`,
          ].join(", "),
        }}
      />
    );
  }
  return null;
};
