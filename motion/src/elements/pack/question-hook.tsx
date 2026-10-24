import { Starred, ease, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function QuestionHook({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const mark = pop(frame, fps, 0, 7);
  const text = ease(frame, fps, 8, 14);
  const bob = Math.sin(frame / 7) * 10 * k;
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 10 * k, width: 960 * k, opacity: exit }}>
      <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: 260 * k, lineHeight: 0.9, color: accent, transform: `translateY(${bob}px) scale(${mark}) rotate(${(1 - mark) * 30}deg)`, filter: `drop-shadow(0 ${12 * k}px ${30 * k}px ${accent}66)` }}>?</div>
      <div style={{ opacity: text, transform: `translateY(${(1 - text) * 30 * k}px)` }}>
        <Starred text={str(v, "question")} theme={theme} accent={accent} size={92 * theme.type * k} style={{ textShadow: `0 ${4 * k}px ${20 * k}px rgba(0,0,0,.5)` }} />
      </div>
    </div>
  );
}
