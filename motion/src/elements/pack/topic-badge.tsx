import { interpolate } from "remotion";
import { clamp, fit, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function TopicBadge({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 10);
  const shine = interpolate(frame, [10, 34], [-30, 130], clamp);
  const icon = str(v, "icon");
  return (
    <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 14 * k, padding: `${14 * k}px ${34 * k}px`, borderRadius: 999, background: accent, color: onAccent(accent), boxShadow: `0 ${12 * k}px ${36 * k}px ${accent}66`, opacity: exit, transform: `scale(${s})` }}>
      {icon ? <span style={{ fontSize: 44 * k }}>{icon}</span> : null}
      <span style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(str(v, "label"), 44 * k, 22), letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{str(v, "label")}</span>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${shine - 18}%, rgba(255,255,255,.55) ${shine}%, transparent ${shine + 18}%)` }} />
    </div>
  );
}
