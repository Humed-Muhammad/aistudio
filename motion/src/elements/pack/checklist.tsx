import { Starred, ease, fit, list, panel, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Checklist({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const items = list(v, "items");
  const gap = Math.max(6, Math.floor((durationInFrames * 0.6) / Math.max(1, items.length)));
  const title = str(v, "title");
  return (
    <div style={{ ...panel(theme, k, 32), width: 820 * k, padding: `${32 * k}px ${40 * k}px`, opacity: exit * box, transform: `scale(${0.94 + 0.06 * box})` }}>
      {title ? <Starred text={title} theme={theme} accent={accent} size={56 * theme.type * k} align="left" color={theme.text} style={{ marginBottom: 18 * k }} /> : null}
      {items.map((item, i) => {
        const row = ease(frame, fps, 8 + i * gap, 12);
        const tick = pop(frame, fps, 14 + i * gap, 10);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 * k, padding: `${12 * k}px 0`, opacity: row, transform: `translateX(${(1 - row) * -24 * k}px)` }}>
            <div style={{ width: 58 * k, height: 58 * k, flexShrink: 0, borderRadius: 16 * k, border: `${4 * k}px solid ${accent}`, background: tick > 0.05 ? accent : "transparent", display: "grid", placeItems: "center" }}>
              <svg width={34 * k} height={34 * k} viewBox="0 0 24 24" style={{ transform: `scale(${tick})` }}>
                <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(item, 46 * k, 26), color: theme.text }}>{item}</div>
          </div>
        );
      })}
    </div>
  );
}
