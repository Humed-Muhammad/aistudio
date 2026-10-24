import { interpolate } from "remotion";
import { Starred, clamp, ease, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function CursorClick({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 8);
  const from = str(v, "from");
  const dx = from.includes("left") ? -260 : 260;
  const dy = from.includes("top") ? -260 : 260;
  const move = ease(frame, fps, 0, 22);
  const press = interpolate(frame, [22, 25, 29], [1, 0.82, 1], clamp);
  const ring = interpolate(frame, [24, 40], [0, 1], clamp);
  const label = ease(frame, fps, 28, 12);
  const text = str(v, "label");
  return (
    <div style={{ position: "relative", width: 0, height: 0, opacity: exit }}>
      <div style={{ position: "absolute", left: -70 * k, top: -70 * k, width: 140 * k, height: 140 * k, borderRadius: 999, border: `${6 * k}px solid ${accent}`, transform: `scale(${0.3 + ring})`, opacity: ring > 0 ? 1 - ring : 0 }} />
      <svg width={70 * k} height={92 * k} viewBox="0 0 70 92" style={{ position: "absolute", left: -6 * k, top: -4 * k, transform: `translate(${(1 - move) * dx * k}px, ${(1 - move) * dy * k}px) scale(${press})`, transformOrigin: "6px 4px", filter: `drop-shadow(0 ${6 * k}px ${10 * k}px rgba(0,0,0,.45))` }}>
        <path d="M6 4 L6 74 L24 58 L36 86 L48 80 L36 53 L60 53 Z" fill="#fff" stroke="#111" strokeWidth={4} strokeLinejoin="round" />
      </svg>
      {text ? (
        <div style={{ position: "absolute", left: 40 * k, top: 80 * k, opacity: label, transform: `translateY(${(1 - label) * 12 * k}px)`, whiteSpace: "nowrap", width: "max-content" }}>
          <Starred text={text} theme={theme} accent={accent} size={52 * theme.type * k} align="left" style={{ textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)` }} />
        </div>
      ) : null}
    </div>
  );
}
