import { ease, fit, list, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

const MEDALS = ["🥇", "🥈", "🥉", "4", "5"];

export default function Leaderboard({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const items = list(v, "items").slice(0, 5);
  const n = items.length;
  return (
    <div style={{ ...panel(theme, k, 32), width: 820 * k, padding: `${30 * k}px ${34 * k}px`, opacity: exit * box }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "title"), 54 * theme.type * k, 22), marginBottom: 16 * k }}>{str(v, "title")}</div>
      {items.map((item, i) => {
        const row = ease(frame, fps, 8 + (n - 1 - i) * 7, 14);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 * k, padding: `${16 * k}px ${20 * k}px`, marginTop: 10 * k, borderRadius: 20 * k, background: i === 0 ? `${accent}33` : "rgba(255,255,255,.07)", border: `${2 * k}px solid ${i === 0 ? accent : "transparent"}`, opacity: row, transform: `translateX(${(1 - row) * 120 * k}px)` }}>
            <span style={{ fontSize: 56 * k, width: 70 * k, textAlign: "center", fontFamily: theme.head, fontWeight: 900, color: theme.sub }}>{MEDALS[i]}</span>
            <span style={{ fontFamily: theme.head, fontWeight: 800, fontSize: fit(item, 48 * k, 20), color: theme.text }}>{item}</span>
          </div>
        );
      })}
    </div>
  );
}
