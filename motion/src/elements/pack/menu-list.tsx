import { ease, fit, list, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function MenuList({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const rows = list(v, "rows").map((r) => {
    const i = r.lastIndexOf(":");
    return i < 0 ? [r, ""] : [r.slice(0, i).trim(), r.slice(i + 1).trim()];
  });
  const gap = Math.max(5, Math.floor((durationInFrames * 0.5) / Math.max(1, rows.length)));
  return (
    <div style={{ ...panel(theme, k, 32), width: 860 * k, padding: `${36 * k}px ${44 * k}px`, opacity: exit * box, transform: `scale(${0.95 + 0.05 * box})` }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 62 * theme.type * k, 20), textAlign: "center", marginBottom: 8 * k }}>{str(v, "title")}</div>
      <div style={{ width: 120 * k, height: 6 * k, borderRadius: 3 * k, background: accent, margin: `0 auto ${22 * k}px` }} />
      {rows.map(([item, price], i) => {
        const row = ease(frame, fps, 10 + i * gap, 12);
        return (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 14 * k, padding: `${12 * k}px 0`, opacity: row, transform: `translateY(${(1 - row) * 14 * k}px)`, fontFamily: theme.body, fontWeight: 700, fontSize: 42 * k, color: theme.text }}>
            <span style={{ whiteSpace: "nowrap" }}>{item}</span>
            <span style={{ flex: 1, borderBottom: `${4 * k}px dotted ${theme.sub}`, transform: `translateY(-${8 * k}px)`, opacity: 0.6 }} />
            <span style={{ color: accent, fontWeight: 900, whiteSpace: "nowrap" }}>{price}</span>
          </div>
        );
      })}
    </div>
  );
}
