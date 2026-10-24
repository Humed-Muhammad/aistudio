import { interpolate } from "remotion";
import { clamp, ease, fit, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

const APPS: Record<string, [string, string]> = {
  Phone: ["#34c759", "✆"],
  WhatsApp: ["#25d366", "✆"],
  Telegram: ["#2aa3e0", "➤"],
  Email: ["#6e8bff", "✉"],
};

export default function ContactCard({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 16);
  const [bg, glyph] = APPS[str(v, "app")] ?? APPS.Phone;
  const number = str(v, "number");
  const n = Math.round(interpolate(frame, [10, 34], [0, number.length], clamp));
  return (
    <div style={{ ...panel(theme, k, 30), display: "flex", alignItems: "center", gap: 24 * k, padding: `${22 * k}px ${36 * k}px ${22 * k}px ${22 * k}px`, opacity: exit * box, transform: `translateY(${(1 - box) * 40 * k}px)` }}>
      <div style={{ width: 100 * k, height: 100 * k, borderRadius: 26 * k, background: bg, display: "grid", placeItems: "center", color: "#fff", fontSize: 54 * k, boxShadow: `0 ${8 * k}px ${24 * k}px ${bg}66` }}>{glyph}</div>
      <div>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 32 * k, color: theme.sub }}>{str(v, "label")}</div>
        <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(number, 62 * k, 14), color: theme.text, letterSpacing: "0.02em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {number.slice(0, n)}
          <span style={{ opacity: 0 }}>{number.slice(n)}</span>
        </div>
      </div>
    </div>
  );
}
