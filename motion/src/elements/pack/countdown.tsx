import { interpolate } from "remotion";
import { Starred, clamp, num, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Countdown({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 8);
  const from = Math.max(1, Math.round(num(v, "from")));
  const sec = Math.floor(frame / fps);
  const local = frame - sec * fps;
  const p = pop(local, fps, 0, 10);
  const fade = interpolate(local, [fps - 6, fps], [1, 0], clamp);
  const ending = sec >= from;
  const label = ending ? str(v, "end") : String(from - sec);
  const ring = interpolate(local, [0, fps], [1, 0], clamp);
  return (
    <div style={{ position: "relative", width: 420 * k, height: 420 * k, display: "grid", placeItems: "center", opacity: exit * (ending ? 1 : fade) }}>
      {!ending ? (
        <svg width={420 * k} height={420 * k} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="44" fill="rgba(0,0,0,.3)" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={276.5} strokeDashoffset={276.5 * (1 - ring)} />
        </svg>
      ) : null}
      <div style={{ transform: `scale(${0.4 + 0.6 * p})`, width: "max-content" }}>
        <Starred text={label} theme={theme} accent={accent} size={(ending ? 130 : 220) * k} weight={900} color="#fff" style={{ textShadow: `0 ${6 * k}px ${24 * k}px rgba(0,0,0,.5)` }} />
      </div>
    </div>
  );
}
