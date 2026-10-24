import { bool, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function LiveBadge({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 6);
  const s = pop(frame, fps, 0, 12);
  const pulse = 0.55 + 0.45 * Math.abs(Math.cos(frame / 9));
  const secs = Math.floor(frame / fps);
  const time = `00:${String(secs).padStart(2, "0")}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 * k, padding: `${12 * k}px ${24 * k}px`, borderRadius: 14 * k, background: "rgba(10,12,18,.65)", backdropFilter: "blur(14px)", border: `${2 * k}px solid rgba(255,255,255,.18)`, opacity: exit, transform: `scale(${s})` }}>
      <div style={{ width: 24 * k, height: 24 * k, borderRadius: 999, background: "#ff3b3b", opacity: pulse, boxShadow: `0 0 ${18 * k * pulse}px #ff3b3b` }} />
      <span style={{ fontFamily: theme.head, fontWeight: 900, fontSize: 40 * k, color: "#fff", letterSpacing: "0.08em" }}>{str(v, "label")}</span>
      {bool(v, "timer") ? <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 34 * k, color: "rgba(255,255,255,.75)" }}>{time}</span> : null}
    </div>
  );
}
