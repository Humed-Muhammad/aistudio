import { random } from "remotion";
import { ease, num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Equalizer({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const appear = ease(frame, fps, 0, 12);
  const n = Math.round(num(v, "bars"));
  const label = str(v, "label");
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 18 * k, opacity: exit * appear }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 * k, height: 200 * k }}>
        {Array.from({ length: n }, (_, i) => {
          const h = 0.2 + 0.8 * Math.abs(Math.sin(frame / (4 + random(`f${i}`) * 5) + random(`p${i}`) * 6)) * (0.55 + 0.45 * Math.sin((i / n) * Math.PI));
          return <div key={i} style={{ width: 22 * k, height: 200 * k * h, borderRadius: 11 * k, background: `linear-gradient(180deg, #ffffff, ${accent})`, boxShadow: `0 0 ${14 * k}px ${accent}66` }} />;
        })}
      </div>
      {label ? <div style={{ fontFamily: theme.head, fontWeight: 800, fontSize: 48 * k, color: "#fff", textShadow: `0 ${3 * k}px ${14 * k}px rgba(0,0,0,.55)` }}>{label}</div> : null}
    </div>
  );
}
