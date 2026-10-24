import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, num, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function NumberCounter({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const t = interpolate(frame, [6, Math.max(8, durationInFrames * 0.55)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const d = Math.max(0, Math.min(2, Math.round(num(v, "decimals"))));
  const n = (num(v, "value") * t).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const text = `${str(v, "prefix")}${n}${str(v, "suffix")}`;
  const full = `${str(v, "prefix")}${num(v, "value").toLocaleString("en-US")}${str(v, "suffix")}`;
  return (
    <div style={{ ...panel(theme, k, 34), padding: `${30 * k}px ${56 * k}px`, textAlign: "center", opacity: exit * box, transform: `scale(${0.9 + 0.1 * box})` }}>
      <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(full, 150 * k, 7), lineHeight: 1, color: accent, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{text}</div>
      <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(str(v, "label"), 44 * k, 22), color: theme.sub, marginTop: 10 * k, whiteSpace: "nowrap" }}>{str(v, "label")}</div>
    </div>
  );
}
