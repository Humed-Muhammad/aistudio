import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, list, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function BarChart({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const rows = list(v, "rows").map((r) => {
    const i = r.lastIndexOf(":");
    return { label: i < 0 ? r : r.slice(0, i).trim(), value: Number((i < 0 ? "0" : r.slice(i + 1)).replace(/[^0-9.-]/g, "")) || 0 };
  });
  const max = Math.max(1, ...rows.map((r) => r.value));
  const h = 520 * k;
  return (
    <div style={{ ...panel(theme, k, 32), width: 900 * k, padding: `${30 * k}px ${36 * k}px`, opacity: exit * box, transform: `scale(${0.95 + 0.05 * box})` }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 52 * theme.type * k, 24), marginBottom: 18 * k }}>{str(v, "title")}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22 * k, height: h }}>
        {rows.map((r, i) => {
          const t = interpolate(frame, [8 + i * 6, 30 + i * 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const top = r.value === max;
          return (
            <div key={i} style={{ flex: 1, display: "grid", alignContent: "end", justifyItems: "center", gap: 8 * k, height: "100%" }}>
              <div style={{ fontFamily: theme.head, fontWeight: 800, fontSize: 32 * k, color: theme.text, opacity: t, fontVariantNumeric: "tabular-nums" }}>{Math.round(r.value * t).toLocaleString("en-US")}</div>
              <div style={{ width: "100%", height: (h - 130 * k) * (r.value / max) * t, borderRadius: `${14 * k}px ${14 * k}px ${6 * k}px ${6 * k}px`, background: top ? accent : "rgba(255,255,255,.32)", boxShadow: top ? `0 0 ${28 * k}px ${accent}88` : undefined }} />
              <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(r.label, 28 * k, 9), color: theme.sub, whiteSpace: "nowrap" }}>{r.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
