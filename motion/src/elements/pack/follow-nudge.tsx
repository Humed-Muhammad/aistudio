import { interpolate } from "remotion";
import { Starred, clamp, ease, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function FollowNudge({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const avatar = pop(frame, fps, 0, 11);
  const press = interpolate(frame, [24, 28, 33], [1, 0.8, 1], clamp);
  const done = frame >= 28;
  const text = ease(frame, fps, 10, 14);
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 56 * k, opacity: exit }}>
      <div style={{ position: "relative", width: 190 * k, height: 190 * k, transform: `scale(${avatar})` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: `linear-gradient(140deg, ${accent}, #ffffff22)`, padding: 8 * k }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "#1b1e26", display: "grid", placeItems: "center", color: "#fff", fontFamily: theme.head, fontWeight: 900, fontSize: 84 * k }}>{str(v, "initials")}</div>
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: -26 * k, width: 64 * k, height: 64 * k, marginLeft: -32 * k, borderRadius: 999, background: done ? "#ffffff" : accent, color: done ? accent : "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 46 * k, transform: `scale(${press})`, boxShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,.35)` }}>{done ? "✓" : "+"}</div>
      </div>
      <div style={{ opacity: text, transform: `translateY(${(1 - text) * 18 * k}px)`, width: "max-content" }}>
        <Starred text={str(v, "text")} theme={theme} accent={accent} size={66 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.5)` }} />
      </div>
    </div>
  );
}
