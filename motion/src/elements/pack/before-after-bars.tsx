import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, num, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function BeforeAfterBars({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const rows: [string, number, string][] = [
    [str(v, "before_label"), num(v, "before"), "rgba(255,255,255,.45)"],
    [str(v, "after_label"), num(v, "after"), accent],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div style={{ ...panel(theme, k, 30), width: 860 * k, padding: `${32 * k}px ${40 * k}px`, opacity: exit * box, transform: `translateY(${(1 - box) * 30 * k}px)` }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 54 * theme.type * k, 24), marginBottom: 24 * k, letterSpacing: theme.tracking }}>{str(v, "title")}</div>
      {rows.map(([label, value, color], i) => {
        const t = interpolate(frame, [10 + i * 10, 34 + i * 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ marginBottom: 20 * k }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.body, fontWeight: 700, fontSize: 36 * k, color: theme.sub, marginBottom: 8 * k }}>
              <span>{label}</span>
              <span style={{ color: theme.text, fontVariantNumeric: "tabular-nums" }}>{Math.round(value * t).toLocaleString("en-US")}{str(v, "unit")}</span>
            </div>
            <div style={{ height: 34 * k, borderRadius: 17 * k, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(value / max) * 100 * t}%`, borderRadius: 17 * k, background: color, boxShadow: i ? `0 0 ${20 * k}px ${accent}88` : undefined }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
