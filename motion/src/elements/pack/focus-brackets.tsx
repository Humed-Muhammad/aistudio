import { Starred, ease, num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function FocusBrackets({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const close = ease(frame, fps, 0, 14);
  const w = num(v, "width") * k;
  const h = num(v, "height") * k;
  const spread = (1 - close) * 60 * k;
  const arm = Math.min(w, h) * 0.22;
  const line = 10 * k;
  const corner = (x: number, y: number, rot: number) => (
    <div style={{ position: "absolute", left: x, top: y, width: arm, height: arm, borderLeft: `${line}px solid ${accent}`, borderTop: `${line}px solid ${accent}`, borderTopLeftRadius: 14 * k, transform: `rotate(${rot}deg)`, filter: `drop-shadow(0 0 ${8 * k}px ${accent}88)` }} />
  );
  const text = str(v, "label");
  return (
    <div style={{ position: "relative", width: w, height: h, opacity: exit * Math.min(1, close * 2) }}>
      {corner(-spread, -spread, 0)}
      {corner(w - arm + spread, -spread, 90)}
      {corner(w - arm + spread, h - arm + spread, 180)}
      {corner(-spread, h - arm + spread, 270)}
      {text ? (
        <div style={{ position: "absolute", top: h + 18 * k, left: "50%", transform: "translateX(-50%)", width: "max-content" }}>
          <Starred text={text} theme={theme} accent={accent} size={50 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)` }} />
        </div>
      ) : null}
    </div>
  );
}
