import { fit, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function StickyNote({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 10);
  const paper = str(v, "paper") || "#BFE6FF";
  const text = str(v, "text");
  const sway = Math.sin(frame / 18) * 1.5;
  return (
    <div style={{ position: "relative", width: 440 * k, minHeight: 360 * k, padding: `${70 * k}px ${40 * k}px ${40 * k}px`, background: `linear-gradient(170deg, ${paper}, ${paper}dd)`, borderRadius: `${6 * k}px ${6 * k}px ${30 * k}px ${6 * k}px`, boxShadow: `0 ${18 * k}px ${36 * k}px rgba(0,0,0,.35)`, transform: `rotate(${4 + sway}deg) scale(${s})`, opacity: exit }}>
      <div style={{ position: "absolute", left: "50%", top: 18 * k, width: 40 * k, height: 40 * k, marginLeft: -20 * k, borderRadius: 999, background: accent, boxShadow: `0 ${4 * k}px ${8 * k}px rgba(0,0,0,.35)` }} />
      <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: fit(text, 52 * k, 34), lineHeight: 1.25, color: "#1d2230" }}>{text}</div>
    </div>
  );
}
