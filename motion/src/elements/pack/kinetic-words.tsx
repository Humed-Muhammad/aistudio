import { interpolate } from "remotion";
import { Starred, clamp, list, pop, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function KineticWords({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 8);
  const words = list(v, "words");
  const each = Math.max(6, Math.floor((durationInFrames - 10) / Math.max(1, words.length)));
  const i = Math.min(words.length - 1, Math.floor(frame / each));
  const local = frame - i * each;
  const p = pop(local, fps, 0, 11);
  const out = i < words.length - 1 ? interpolate(local, [each - 4, each], [1, 0], clamp) : exit;
  if (!words.length) return null;
  return (
    <div style={{ width: 1000 * k, opacity: out, transform: `scale(${1.35 - 0.35 * p})`, filter: `drop-shadow(0 ${8 * k}px ${28 * k}px rgba(0,0,0,.5))` }}>
      <Starred text={words[i]} theme={theme} accent={accent} size={170 * theme.type * k} weight={900} />
    </div>
  );
}
