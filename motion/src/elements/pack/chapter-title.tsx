import { Starred, ease, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function ChapterTitle({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const n = pop(frame, fps, 0, 14);
  const line = ease(frame, fps, 6, 18);
  const title = ease(frame, fps, 12, 16);
  return (
    <div style={{ width: 900 * k, display: "grid", justifyItems: "center", gap: 18 * k, opacity: exit }}>
      <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: 230 * k, lineHeight: 0.9, background: `linear-gradient(180deg, #ffffff 10%, ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", transform: `scale(${0.6 + 0.4 * n})`, opacity: Math.min(1, n * 1.4), filter: `drop-shadow(0 ${10 * k}px ${30 * k}px ${accent}55)` }}>
        {str(v, "number")}
      </div>
      <div style={{ width: 560 * k * line, height: 6 * k, borderRadius: 3 * k, background: accent }} />
      <div style={{ opacity: title, transform: `translateY(${(1 - title) * 24 * k}px)` }}>
        <Starred text={str(v, "title")} theme={theme} accent={accent} size={76 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.45)` }} />
      </div>
    </div>
  );
}
