import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, list, mix, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

const SHADES = ["#ffffff", "#9fb4ff", "#7CF2C4", "#FF8FA3", "#B79CFF", "#FFB27A"];

export default function DonutChart({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const parts = list(v, "parts").map((r) => {
    const i = r.lastIndexOf(":");
    return { label: i < 0 ? r : r.slice(0, i).trim(), value: Math.max(0, Number((i < 0 ? "0" : r.slice(i + 1)).replace(/[^0-9.]/g, "")) || 0) };
  });
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  const t = interpolate(frame, [8, durationInFrames * 0.6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const c = 2 * Math.PI * 38;
  let start = 0;
  const color = (i: number) => (i === 0 ? accent : mix(SHADES[i % SHADES.length], accent, 0.15));
  return (
    <div style={{ ...panel(theme, k, 32), width: 900 * k, padding: `${30 * k}px ${36 * k}px`, opacity: exit * box }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 52 * theme.type * k, 24), marginBottom: 18 * k }}>{str(v, "title")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 36 * k }}>
        <svg width={360 * k} height={360 * k} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="16" />
          {parts.map((p, i) => {
            const share = (p.value / total) * t;
            const el = <circle key={i} cx="50" cy="50" r="38" fill="none" stroke={color(i)} strokeWidth="16" strokeDasharray={`${share * c} ${c}`} strokeDashoffset={-start * c} />;
            start += share;
            return el;
          })}
        </svg>
        <div style={{ display: "grid", gap: 16 * k }}>
          {parts.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 * k, fontFamily: theme.body, fontWeight: 700, fontSize: fit(p.label, 34 * k, 16), color: theme.text, opacity: interpolate(frame, [10 + i * 5, 18 + i * 5], [0, 1], clamp) }}>
              <span style={{ width: 24 * k, height: 24 * k, borderRadius: 6 * k, background: color(i), flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={{ color: theme.sub, fontVariantNumeric: "tabular-nums" }}>{Math.round((p.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
