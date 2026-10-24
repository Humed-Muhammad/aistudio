import { ease, fit, list, panel, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function OpeningHours({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const badge = pop(frame, fps, 18, 10);
  const hand = frame * 6;
  const rows = list(v, "rows").map((r) => {
    const i = r.indexOf(":");
    return i < 0 ? [r, ""] : [r.slice(0, i).trim(), r.slice(i + 1).trim()];
  });
  return (
    <div style={{ ...panel(theme, k, 32), position: "relative", width: 820 * k, padding: `${34 * k}px ${40 * k}px`, opacity: exit * box }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 * k, marginBottom: 20 * k }}>
        <svg width={90 * k} height={90 * k} viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" fill="none" stroke={accent} strokeWidth="3.5" />
          <line x1="20" y1="20" x2="20" y2="9" stroke="#fff" strokeWidth="3" strokeLinecap="round" transform={`rotate(${hand} 20 20)`} />
          <line x1="20" y1="20" x2="27" y2="20" stroke="#fff" strokeWidth="3" strokeLinecap="round" transform={`rotate(${hand / 12} 20 20)`} />
        </svg>
        <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 58 * theme.type * k, 16) }}>{str(v, "title")}</div>
      </div>
      {rows.map(([days, hours], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: `${12 * k}px 0`, borderTop: i ? `${2 * k}px solid rgba(255,255,255,.12)` : undefined, fontFamily: theme.body, fontWeight: 700, fontSize: 40 * k, opacity: ease(frame, fps, 8 + i * 5, 12) }}>
          <span style={{ color: theme.sub }}>{days}</span>
          <span style={{ color: theme.text }}>{hours}</span>
        </div>
      ))}
      {str(v, "badge") ? (
        <div style={{ position: "absolute", right: -20 * k, top: -24 * k, padding: `${10 * k}px ${22 * k}px`, borderRadius: 999, background: "#2fd38a", color: "#062b1a", fontFamily: theme.head, fontWeight: 900, fontSize: 32 * k, transform: `rotate(6deg) scale(${badge})`, boxShadow: `0 ${8 * k}px ${20 * k}px rgba(0,0,0,.3)` }}>● {str(v, "badge")}</div>
      ) : null}
    </div>
  );
}
