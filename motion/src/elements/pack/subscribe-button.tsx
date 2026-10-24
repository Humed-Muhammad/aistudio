import { interpolate } from "remotion";
import { clamp, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function SubscribeButton({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const appear = pop(frame, fps, 0, 11);
  const click = 22;
  const press = interpolate(frame, [click, click + 3, click + 8], [1, 0.88, 1], clamp);
  const done = frame >= click + 3;
  const ring = Math.sin(Math.max(0, frame - click - 4) * 0.9) * interpolate(frame, [click + 4, click + 24], [18, 0], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 * k, opacity: exit, transform: `scale(${appear})` }}>
      <div style={{ padding: `${24 * k}px ${54 * k}px`, borderRadius: 999, background: done ? "rgba(255,255,255,.2)" : accent, color: done ? "#fff" : onAccent(accent), border: `${3 * k}px solid ${done ? "rgba(255,255,255,.45)" : accent}`, fontFamily: theme.head, fontWeight: 900, fontSize: 52 * k, transform: `scale(${press})`, boxShadow: done ? undefined : `0 ${12 * k}px ${36 * k}px ${accent}66`, backdropFilter: "blur(16px)", whiteSpace: "nowrap" }}>
        {done ? `${str(v, "after")} ✓` : str(v, "before")}
      </div>
      <div style={{ fontSize: 76 * k, opacity: done ? 1 : 0, transform: `rotate(${ring}deg)`, transformOrigin: "50% 10%" }}>🔔</div>
    </div>
  );
}
