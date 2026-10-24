import { interpolate } from "remotion";
import { Starred, clamp, ease, num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function CircleHighlight({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const draw = interpolate(frame, [0, 20], [0, 1], clamp);
  const label = ease(frame, fps, 16, 12);
  const w = num(v, "width") * k;
  const h = num(v, "height") * k;
  const text = str(v, "label");
  // One loop and a bit, slightly uneven, like a marker stroke.
  const d = "M 0.08 0.55 C 0.02 0.18, 0.55 -0.04, 0.86 0.14 C 1.06 0.27, 0.98 0.78, 0.6 0.92 C 0.3 1.02, -0.02 0.86, 0.04 0.5 C 0.08 0.3, 0.25 0.16, 0.42 0.1";
  return (
    <div style={{ position: "relative", width: w, height: h, opacity: exit }}>
      <svg width={w} height={h} viewBox="0 0 1 1" preserveAspectRatio="none" style={{ overflow: "visible", position: "absolute", inset: 0, filter: `drop-shadow(0 0 ${8 * k}px ${accent}88)` }}>
        <path d={d} fill="none" stroke={accent} strokeWidth={10 * k} vectorEffect="non-scaling-stroke" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
      {text ? (
        <div style={{ position: "absolute", top: h + 14 * k, left: "50%", transform: `translateX(-50%) translateY(${(1 - label) * 14 * k}px)`, opacity: label, whiteSpace: "nowrap" }}>
          <Starred text={text} theme={theme} accent={accent} size={54 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)` }} />
        </div>
      ) : null}
    </div>
  );
}
