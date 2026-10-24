import { interpolate, Easing } from "remotion";
import { clamp, ease, fit, panel, str, useLife, useSvgId } from "../kit";
import type { ElementProps } from "../types";

const PTS: [number, number][] = [[0, 82], [14, 74], [28, 78], [42, 60], [56, 64], [70, 40], [84, 30], [100, 8]];

export default function GrowthLine({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const draw = interpolate(frame, [8, durationInFrames * 0.55], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const head = interpolate(draw, [0.9, 1], [0, 1], clamp);
  const d = PTS.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${d} L100 100 L0 100 Z`;
  const fillId = useSvgId("growth");
  const clipId = useSvgId("reveal");
  return (
    <div style={{ ...panel(theme, k, 32), width: 880 * k, padding: `${30 * k}px ${36 * k}px`, opacity: exit * box }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 * k }}>
        <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(str(v, "result"), 110 * k, 6), color: accent, lineHeight: 1 }}>{str(v, "result")}</div>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(str(v, "label"), 36 * k, 22), color: theme.sub }}>{str(v, "label")}</div>
      </div>
      <svg width={808 * k} height={380 * k} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ marginTop: 16 * k, overflow: "visible" }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity=".45" />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="0" y="-10" width={100 * draw} height="120" />
          </clipPath>
        </defs>
        <path d={area} fill={`url(#${fillId})`} clipPath={`url(#${clipId})`} />
        <path d={d} fill="none" stroke={accent} strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ strokeWidth: 9 * k }} />
        <circle cx="100" cy="8" r="2.4" fill="#fff" opacity={head} />
      </svg>
    </div>
  );
}
