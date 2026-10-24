import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function ProgressRing({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const appear = ease(frame, fps, 0, 14);
  const t = interpolate(frame, [6, Math.max(8, durationInFrames * 0.6)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pct = Math.max(0, Math.min(100, num(v, "percent"))) * t;
  const size = 420 * k;
  const r = 170;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 16 * k, opacity: exit * appear, transform: `scale(${0.85 + 0.15 * appear})` }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 400 400" style={{ transform: "rotate(-90deg)", filter: `drop-shadow(0 0 ${18 * k}px ${accent}66)` }}>
          <circle cx="200" cy="200" r={r} fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.16)" strokeWidth={30} />
          <circle cx="200" cy="200" r={r} fill="none" stroke={accent} strokeWidth={30} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: theme.head, fontWeight: 900, fontSize: 120 * k, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{Math.round(pct)}%</div>
      </div>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "label"), 56 * theme.type * k, 20), color: theme.ink ?? theme.text, textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.45)`, whiteSpace: "nowrap" }}>{str(v, "label")}</div>
    </div>
  );
}
