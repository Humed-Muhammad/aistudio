import { interpolate } from "remotion";
import { clamp, num, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function TapRipple({ v, accent, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames, 6);
  const taps = Math.max(1, Math.round(num(v, "taps")));
  const size = 220 * k;
  return (
    <div style={{ position: "relative", width: size, height: size, opacity: exit }}>
      {Array.from({ length: taps }, (_, i) => {
        const f = frame - i * 14;
        const grow = interpolate(f, [0, 22], [0.2, 1], clamp);
        const fade = interpolate(f, [0, 4, 22], [0, 1, 0], clamp);
        const dot = interpolate(f, [0, 3, 10], [0, 1, 0], clamp);
        return (
          <div key={i}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `${8 * k}px solid ${accent}`, transform: `scale(${grow})`, opacity: fade }} />
            <div style={{ position: "absolute", inset: size * 0.36, borderRadius: 999, background: "rgba(255,255,255,.85)", opacity: dot, boxShadow: `0 0 ${20 * k}px ${accent}` }} />
          </div>
        );
      })}
    </div>
  );
}
