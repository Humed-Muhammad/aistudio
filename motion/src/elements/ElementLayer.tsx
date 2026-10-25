import { Component as ReactComponent, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { kitFor } from "../graphicKits";
import { findTrigger, follow } from "../tracking";
import type { ShortEvent, Tracks } from "../types";
import { ELEMENTS } from "./registry.gen";
import type { ElementMeta, ElementValues } from "./types";

/** Field defaults with the graphic's own values on top. */
export const valuesFor = (
  meta: ElementMeta,
  props?: Record<string, unknown>,
): ElementValues => {
  const v: ElementValues = {};
  for (const f of meta.fields)
    v[f.key] =
      (props?.[f.key] as ElementValues[string] | undefined) ?? f.default;
  return v;
};

/** A graphic that throws (say, an odd value typed into a field) draws nothing instead of breaking the whole edit. */
class Guard extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Where a hand-anchored graphic sits now (video pixels), or null before its hand shows up or after it is lost.
 * Same tracking as hand stickers: palm centre, resting on top of the palm (above_palm) or at the fingertip.
 */
const handSpot = (e: ShortEvent, tracks: Tracks, abs: number, fps: number, width: number, height: number) => {
  const trigger = findTrigger(tracks, e, fps);
  if (!trigger || abs < trigger.frame) return null;
  const track = tracks.hands[trigger.side];
  const now = follow(track, abs, 12); // bridge 0.4 s of lost tracking
  if (!now) return null;
  const [px, py, tx, ty, s] = now.sample;
  const before = follow(track, abs - 2);
  const tilt = before ? Math.max(-12, Math.min(12, (px - before.sample[0]) * width * 0.4)) : 0;
  const handPx = s * height;
  const [x, y] = e.point === "fingertip" ? [tx * width, ty * height] : e.point === "palm" ? [px * width, py * height] : [px * width, py * height - handPx * 0.3];
  return { x, y, tilt, visible: now.visible, rest: e.point !== "palm" };
};

/** One library graphic in the edit: looked up by id, placed at (x, y) and scaled by size unless it is full-frame.
 * With anchor "hand" it rides on the tracked hand instead (draw it inside the camera layer, like stickers). */
export const ElementLayer: React.FC<{
  event: ShortEvent;
  duration: number;
  accent: string;
  style?: string;
  tracks?: Tracks;
  from?: number;
}> = ({ event: e, duration, accent, style, tracks, from = 0 }) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const entry = ELEMENTS[e.element ?? ""];
  if (!entry) return null;
  const { meta, Component } = entry;
  const kit = kitFor(style);
  const drawn = (
    <Guard>
      <Component
        v={valuesFor(meta, e.props)}
        theme={kit.dark}
        kit={kit}
        accent={e.accent || accent}
        durationInFrames={duration}
        width={width}
        height={height}
        k={width / 1080}
      />
    </Guard>
  );
  if (meta.layout === "full") return <AbsoluteFill>{drawn}</AbsoluteFill>;
  if (e.anchor === "hand") {
    const spot = tracks ? handSpot(e, tracks, from + frame, fps, width, height) : null;
    if (!spot) return null;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: spot.x,
            top: spot.y,
            opacity: spot.visible,
            // Resting on the palm: the graphic's bottom edge sits on the hand.
            transform: `translate(-50%, ${spot.rest ? "-100%" : "-50%"}) rotate(${spot.tilt}deg) scale(${e.size || 1})`,
            transformOrigin: spot.rest ? "50% 100%" : "50% 50%",
          }}
        >
          {drawn}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: e.x * width,
          top: e.y * height,
          transform: `translate(-50%, -50%) scale(${e.size || 1})`,
          transformOrigin: "50% 50%",
        }}
      >
        {drawn}
      </div>
    </AbsoluteFill>
  );
};
