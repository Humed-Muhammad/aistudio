import { interpolate } from "remotion";
import { clamp, ease, fit, num, pop, str, useLife, useSvgId } from "../kit";
import type { ElementProps } from "../types";

const STAR = "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z";

export default function StarRating({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const score = Math.max(0, Math.min(5, num(v, "score")));
  const fill = interpolate(frame, [6, 6 + 5 * 6], [0, score], clamp);
  const text = ease(frame, fps, 26, 12);
  const gid = useSvgId("star");
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 14 * k, opacity: exit }}>
      <div style={{ display: "flex", gap: 10 * k }}>
        {Array.from({ length: 5 }, (_, i) => {
          const part = Math.max(0, Math.min(1, fill - i));
          const s = pop(frame, fps, 4 + i * 4, 9);
          return (
            <svg key={i} width={130 * k} height={130 * k} viewBox="0 0 24 24" style={{ transform: `scale(${s})`, filter: part > 0 ? `drop-shadow(0 0 ${10 * k}px ${accent}aa)` : undefined }}>
              <defs>
                <linearGradient id={`${gid}${i}`}>
                  <stop offset={part} stopColor={accent} />
                  <stop offset={part} stopColor="rgba(255,255,255,.28)" />
                </linearGradient>
              </defs>
              <path d={STAR} fill={`url(#${gid}${i})`} />
            </svg>
          );
        })}
      </div>
      <div style={{ opacity: text, textAlign: "center" }}>
        <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: 96 * k, color: "#fff", lineHeight: 1, textShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.5)` }}>{score.toFixed(1)}</div>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(str(v, "reviews"), 40 * k, 26), color: "rgba(255,255,255,.85)", textShadow: `0 ${3 * k}px ${12 * k}px rgba(0,0,0,.5)` }}>{str(v, "reviews")}</div>
      </div>
    </div>
  );
}
