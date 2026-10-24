import { interpolate } from "remotion";
import { Starred, clamp, ease, num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Spotlight({ v, theme, accent, durationInFrames, width, height, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 12);
  const on = interpolate(frame, [0, 12], [0, 1], clamp) * exit;
  const x = num(v, "cx") * width;
  const y = num(v, "cy") * height;
  const r = num(v, "radius") * width * (1.6 - 0.6 * ease(frame, fps, 0, 18));
  const text = str(v, "label");
  return (
    <div style={{ position: "absolute", inset: 0, opacity: on }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent 0%, transparent 70%, rgba(0,0,0,.72) 100%)` }} />
      {text ? (
        <div style={{ position: "absolute", left: x, top: Math.min(height - 200 * k, y + r + 20 * k), transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
          <Starred text={text} theme={theme} accent={accent} size={60 * theme.type * k} />
        </div>
      ) : null}
    </div>
  );
}
