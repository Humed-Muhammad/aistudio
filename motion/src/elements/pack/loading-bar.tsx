import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function LoadingBar({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 12);
  const t = interpolate(frame, [8, durationInFrames * 0.75], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const done = t >= 1;
  const label = done ? str(v, "done") : str(v, "label");
  return (
    <div style={{ ...panel(theme, k, 28), width: 820 * k, padding: `${30 * k}px ${36 * k}px`, opacity: exit * box }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.body, fontWeight: 700, fontSize: fit(label, 40 * k, 30), color: theme.text, marginBottom: 18 * k }}>
        <span>{label}</span>
        <span style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{Math.round(t * 100)}%</span>
      </div>
      <div style={{ height: 30 * k, borderRadius: 15 * k, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${t * 100}%`, borderRadius: 15 * k, background: `repeating-linear-gradient(-45deg, ${accent} 0 ${18 * k}px, ${accent}cc ${18 * k}px ${36 * k}px)`, backgroundPosition: `${frame * 2}px 0`, boxShadow: `0 0 ${18 * k}px ${accent}88` }} />
      </div>
    </div>
  );
}
