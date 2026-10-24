import { interpolate } from "remotion";
import { clamp, fit, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function RubberStamp({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames);
  const slam = interpolate(frame, [0, 6], [2.4, 1], clamp);
  const fade = interpolate(frame, [0, 5], [0, 1], clamp);
  const shake = frame > 5 && frame < 12 ? Math.sin(frame * 3) * 6 * k : 0;
  const color = str(v, "color") || accent;
  const word = str(v, "word");
  return (
    <div style={{ padding: `${14 * k}px ${40 * k}px`, border: `${10 * k}px solid ${color}`, borderRadius: 22 * k, color, fontFamily: theme.head, fontWeight: 900, fontSize: fit(word, 120 * k, 9), letterSpacing: "0.08em", whiteSpace: "nowrap", transform: `translateX(${shake}px) rotate(-12deg) scale(${slam})`, opacity: fade * exit * 0.92, maskImage: "repeating-linear-gradient(115deg, #000 0 14px, rgba(0,0,0,.78) 14px 18px)", WebkitMaskImage: "repeating-linear-gradient(115deg, #000 0 14px, rgba(0,0,0,.78) 14px 18px)", textShadow: `0 0 ${2 * k}px ${color}` }}>
      {word}
    </div>
  );
}
