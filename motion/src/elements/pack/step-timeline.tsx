import { interpolate } from "remotion";
import { clamp, ease, fit, list, pop, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function StepTimeline({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const steps = list(v, "steps");
  const n = Math.max(1, steps.length);
  const span = Math.max(10, durationInFrames * 0.65);
  const fill = interpolate(frame, [6, 6 + span], [0, 1], clamp);
  const w = 900 * k;
  const appear = ease(frame, fps, 0, 12);
  return (
    <div style={{ position: "relative", width: w, height: 230 * k, opacity: exit * appear }}>
      <div style={{ position: "absolute", left: w / (2 * n), right: w / (2 * n), top: 50 * k, height: 10 * k, borderRadius: 5 * k, background: "rgba(255,255,255,.22)" }} />
      <div style={{ position: "absolute", left: w / (2 * n), top: 50 * k, height: 10 * k, borderRadius: 5 * k, background: accent, width: (w - w / n) * fill, boxShadow: `0 0 ${16 * k}px ${accent}` }} />
      {steps.map((s, i) => {
        const at = n > 1 ? i / (n - 1) : 0;
        const lit = pop(frame, fps, 6 + at * span, 10);
        const x = (w / n) * (i + 0.5);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: 0, transform: "translateX(-50%)", display: "grid", justifyItems: "center", gap: 14 * k, width: w / n }}>
            <div style={{ width: 110 * k, height: 110 * k, borderRadius: 999, background: lit > 0.05 ? accent : theme.card, border: `${5 * k}px solid ${lit > 0.05 ? "#fff" : theme.border}`, display: "grid", placeItems: "center", color: "#fff", fontFamily: theme.head, fontWeight: 900, fontSize: 48 * k, transform: `scale(${0.8 + 0.2 * Math.min(1, lit)})`, boxShadow: lit > 0.05 ? `0 0 ${30 * k}px ${accent}aa` : theme.shadow }}>{i + 1}</div>
            <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(s, 40 * theme.type * k, 10), color: theme.ink ?? theme.text, textShadow: `0 ${3 * k}px ${12 * k}px rgba(0,0,0,.5)`, whiteSpace: "nowrap", opacity: 0.55 + 0.45 * Math.min(1, lit) }}>{s}</div>
          </div>
        );
      })}
    </div>
  );
}
