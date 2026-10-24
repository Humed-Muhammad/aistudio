import { interpolate } from "remotion";
import { Starred, clamp, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function RightWrong({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const ring = pop(frame, fps, 0, 10);
  const draw = interpolate(frame, [6, 18], [0, 1], clamp);
  const right = str(v, "mark") === "Right";
  const color = right ? "#2fd38a" : "#ff4d5e";
  const label = str(v, "label");
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 16 * k, opacity: exit }}>
      <svg width={300 * k} height={300 * k} viewBox="0 0 100 100" style={{ transform: `scale(${ring})`, filter: `drop-shadow(0 ${10 * k}px ${24 * k}px ${color}66)` }}>
        <circle cx="50" cy="50" r="44" fill={color} />
        {right ? (
          <path d="M28 52 L44 67 L73 35" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        ) : (
          <>
            <path d="M33 33 L67 67" stroke="#fff" strokeWidth="9" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, draw * 2)} />
            <path d="M67 33 L33 67" stroke="#fff" strokeWidth="9" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0, draw * 2 - 1)} />
          </>
        )}
      </svg>
      {label ? <div style={{ width: "max-content" }}><Starred text={label} theme={theme} accent={accent} size={64 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)` }} /></div> : null}
    </div>
  );
}
