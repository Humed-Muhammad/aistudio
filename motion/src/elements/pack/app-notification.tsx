import { ease, fit, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function AppNotification({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const drop = ease(frame, fps, 0, 18);
  const body = str(v, "body");
  return (
    <div style={{ width: 900 * k, padding: `${24 * k}px ${28 * k}px`, borderRadius: 44 * k, background: "rgba(245,246,250,.82)", backdropFilter: "blur(30px) saturate(1.6)", boxShadow: `0 ${20 * k}px ${50 * k}px rgba(0,0,0,.3)`, display: "flex", gap: 22 * k, alignItems: "center", color: "#16181f", opacity: exit, transform: `translateY(${(1 - drop) * -260 * k + (1 - exit) * -120 * k}px)` }}>
      <div style={{ width: 92 * k, height: 92 * k, flexShrink: 0, borderRadius: 22 * k, background: `linear-gradient(140deg, ${accent}, #8f7cff)`, display: "grid", placeItems: "center", fontSize: 50 * k }}>{str(v, "icon")}</div>
      <div style={{ flex: 1, fontFamily: theme.body }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28 * k, fontWeight: 600, color: "rgba(22,24,31,.55)" }}>
          <span>{str(v, "app").toUpperCase()}</span>
          <span>{str(v, "time")}</span>
        </div>
        <div style={{ fontSize: 40 * k, fontWeight: 800, marginTop: 4 * k }}>{str(v, "title")}</div>
        <div style={{ fontSize: fit(body, 36 * k, 40), fontWeight: 500, color: "rgba(22,24,31,.75)" }}>{body}</div>
      </div>
    </div>
  );
}
