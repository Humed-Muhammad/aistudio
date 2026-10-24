import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, list, panel, useLife } from "../kit";
import type { ElementProps } from "../types";

/** "10,000+" counts up its number part and keeps the rest; text without a number just appears. */
const counting = (text: string, t: number) => {
  const m = text.match(/[\d.,]+/);
  if (!m) return text;
  const target = Number(m[0].replace(/,/g, ""));
  const dec = (m[0].split(".")[1] ?? "").length;
  const n = (target * t).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return text.replace(m[0], n);
};

export default function StatRow({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const stats = list(v, "stats").slice(0, 4).map((s) => s.split("|").map((x) => x.trim()));
  return (
    <div style={{ display: "flex", gap: 18 * k, opacity: exit }}>
      {stats.map(([value, caption], i) => {
        const box = ease(frame, fps, i * 5, 14);
        const t = interpolate(frame, [6 + i * 5, durationInFrames * 0.55], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ ...panel(theme, k, 26), width: 300 * k, padding: `${26 * k}px ${16 * k}px`, textAlign: "center", opacity: box, transform: `translateY(${(1 - box) * 30 * k}px)` }}>
            <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(value ?? "", 76 * k, 6), color: accent, lineHeight: 1.05, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{counting(value ?? "", t)}</div>
            <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(caption ?? "", 32 * k, 12), color: theme.sub, marginTop: 6 * k }}>{caption}</div>
          </div>
        );
      })}
    </div>
  );
}
