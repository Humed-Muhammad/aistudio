import { interpolate } from "remotion";
import { clamp, ease, fit, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function OrderButton({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 10);
  const pulse = 1 + 0.04 * Math.sin(frame / 5);
  const tap = interpolate(frame, [22, 25, 30], [1, 0.9, 1], clamp);
  const ring = interpolate(frame, [24, 42], [0, 1], clamp);
  const sub = ease(frame, fps, 10, 12);
  const text = str(v, "text");
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 18 * k, opacity: exit }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: -20 * k, borderRadius: 999, border: `${6 * k}px solid ${accent}`, opacity: ring > 0 ? 1 - ring : 0, transform: `scale(${0.9 + ring * 0.35})` }} />
        <div style={{ padding: `${30 * k}px ${80 * k}px`, borderRadius: 999, background: `linear-gradient(180deg, ${accent}, ${accent}cc)`, color: onAccent(accent), fontFamily: theme.head, fontWeight: 900, fontSize: fit(text, 70 * k, 12), whiteSpace: "nowrap", boxShadow: `0 ${16 * k}px ${44 * k}px ${accent}77, inset 0 ${3 * k}px 0 rgba(255,255,255,.4)`, transform: `scale(${s * pulse * tap})` }}>
          {text} →
        </div>
      </div>
      <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(str(v, "sub"), 38 * k, 28), color: "#fff", opacity: sub, textShadow: `0 ${3 * k}px ${12 * k}px rgba(0,0,0,.55)` }}>{str(v, "sub")}</div>
    </div>
  );
}
