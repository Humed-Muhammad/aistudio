import { interpolate } from "remotion";
import { Starred, clamp, ease, fit, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function ArrowCallout({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const label = ease(frame, fps, 0, 12);
  const draw = interpolate(frame, [6, 24], [0, 1], clamp);
  const head = interpolate(frame, [22, 28], [0, 1], clamp);
  const dir = str(v, "direction");
  const fx = dir.includes("left") ? -1 : 1;
  const fy = dir.includes("up") ? -1 : 1;
  const text = str(v, "label");
  return (
    <div style={{ display: "grid", justifyItems: "center", opacity: exit, transform: `scale(${fx}, ${fy})` }}>
      <div style={{ transform: `scale(${fx}, ${fy})`, opacity: label, order: fy < 0 ? 2 : 0, width: "max-content" }}>
        <Starred text={text} theme={theme} accent={accent} size={fit(text, 64 * theme.type * k, 16)} style={{ textShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.5)`, whiteSpace: "nowrap" }} />
      </div>
      <svg width={300 * k} height={260 * k} viewBox="0 0 300 260" style={{ overflow: "visible", filter: `drop-shadow(0 ${6 * k}px ${10 * k}px rgba(0,0,0,.35))` }}>
        <path d="M60 10 C 40 120, 120 200, 250 220" fill="none" stroke={accent} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        <path d="M206 186 L 254 221 L 200 246" fill="none" stroke={accent} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={head} />
      </svg>
    </div>
  );
}
