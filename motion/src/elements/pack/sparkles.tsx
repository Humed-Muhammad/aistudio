import { interpolate, random } from "remotion";
import { clamp, num, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Sparkles({ v, accent, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames, 12);
  const spread = num(v, "spread") * k;
  const n = Math.round(num(v, "amount"));
  return (
    <div style={{ position: "relative", width: spread, height: spread, opacity: exit }}>
      {Array.from({ length: n }, (_, i) => {
        const x = random(`x${i}`) * spread;
        const y = random(`y${i}`) * spread;
        const start = random(`t${i}`) * durationInFrames * 0.5;
        const life = 14 + random(`l${i}`) * 16;
        const t = interpolate(frame - start, [0, life / 2, life], [0, 1, 0], clamp);
        const again = interpolate(frame - start - life, [0, life / 2, life], [0, 1, 0], clamp);
        const s = Math.max(t, again) * (30 + random(`s${i}`) * 40) * k;
        return (
          <svg key={i} width={s} height={s} viewBox="0 0 20 20" style={{ position: "absolute", left: x - s / 2, top: y - s / 2, transform: `rotate(${frame * 3 + i * 40}deg)`, filter: `drop-shadow(0 0 ${6 * k}px ${i % 3 ? "#fff" : accent})` }}>
            <path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0Z" fill={i % 3 ? "#fff" : accent} />
          </svg>
        );
      })}
    </div>
  );
}
