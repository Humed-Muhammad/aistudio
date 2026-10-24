import { fit, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function DiscountBurst({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 9);
  const spin = frame * 0.6;
  const points = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r = i % 2 ? 0.84 : 1;
    return `${50 + Math.cos(a) * 50 * r},${50 + Math.sin(a) * 50 * r}`;
  }).join(" ");
  const big = str(v, "big");
  return (
    <div style={{ position: "relative", width: 380 * k, height: 380 * k, opacity: exit, transform: `scale(${s}) rotate(${(1 - s) * -60}deg)` }}>
      <svg viewBox="0 0 100 100" width={380 * k} height={380 * k} style={{ position: "absolute", inset: 0, transform: `rotate(${spin}deg)`, filter: `drop-shadow(0 ${14 * k}px ${28 * k}px rgba(0,0,0,.35))` }}>
        <polygon points={points} fill={accent} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center", color: onAccent(accent), fontFamily: theme.head, fontWeight: 900, transform: "rotate(-8deg)" }}>
        <div style={{ fontSize: fit(big, 110 * k, 4), lineHeight: 1 }}>{big}</div>
        <div style={{ fontSize: 46 * k, letterSpacing: "0.08em" }}>{str(v, "small")}</div>
      </div>
    </div>
  );
}
