import { interpolate } from "remotion";
import { clamp, fit, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function TypewriterTitle({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames);
  const chars = Array.from(str(v, "text"));
  const n = Math.round(interpolate(frame, [2, Math.max(4, durationInFrames * 0.6)], [0, chars.length], clamp));
  const caret = Math.floor(frame / 8) % 2 === 0 || n < chars.length;
  const size = fit(str(v, "text"), 96 * theme.type * k, 18);
  return (
    <div style={{ width: 980 * k, textAlign: "center", opacity: exit, fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: size, color: theme.ink ?? theme.text, letterSpacing: theme.tracking, textShadow: `0 ${4 * k}px ${20 * k}px rgba(0,0,0,.5)` }}>
      <span>{chars.slice(0, n).join("")}</span>
      <span style={{ display: "inline-block", width: size * 0.08, height: size * 0.95, marginLeft: size * 0.05, verticalAlign: "-0.12em", background: accent, opacity: caret ? 1 : 0, borderRadius: size * 0.03 }} />
      <span style={{ opacity: 0 }}>{chars.slice(n).join("")}</span>
    </div>
  );
}
