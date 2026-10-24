import { interpolate } from "remotion";
import { Starred, clamp, ease, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function SaveShare({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const a = pop(frame, fps, 0, 10);
  const b = pop(frame, fps, 6, 10);
  const filled = interpolate(frame, [18, 22], [0, 1], clamp);
  const text = ease(frame, fps, 10, 14);
  const icon = (s: number, child: React.ReactNode) => (
    <div style={{ width: 130 * k, height: 130 * k, borderRadius: 999, background: "rgba(255,255,255,.16)", backdropFilter: "blur(16px)", border: `${2 * k}px solid rgba(255,255,255,.35)`, display: "grid", placeItems: "center", transform: `scale(${s})` }}>{child}</div>
  );
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 24 * k, opacity: exit }}>
      <div style={{ display: "flex", gap: 30 * k }}>
        {icon(a, <svg width={60 * k} height={60 * k} viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z" fill={filled > 0.5 ? accent : "none"} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>)}
        {icon(b, <svg width={60 * k} height={60 * k} viewBox="0 0 24 24"><path d="M14 4l7 7-7 7v-4c-5 0-8 1.5-11 5 1-5 4-10 11-11z" fill="#fff" /></svg>)}
      </div>
      <div style={{ opacity: text, transform: `translateY(${(1 - text) * 16 * k}px)`, width: "max-content" }}>
        <Starred text={str(v, "text")} theme={theme} accent={accent} size={66 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.5)` }} />
      </div>
    </div>
  );
}
