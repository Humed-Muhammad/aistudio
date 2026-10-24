import { interpolate, random } from "remotion";
import { clamp, num, useLife } from "../kit";
import type { ElementProps } from "../types";

const COLORS = ["#ffffff", "#7cc8ff", "#ff8fa3", "#7CF2C4", "#c9a7ff"];

export default function Fireworks({ v, accent, durationInFrames, width, height, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames, 12);
  const bursts = Math.round(num(v, "bursts"));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: exit, overflow: "hidden" }}>
      {Array.from({ length: bursts }, (_, b) => {
        const at = b * (durationInFrames * 0.7) / bursts;
        const f = frame - at;
        if (f < 0) return null;
        const cx = (0.2 + random(`bx${b}`) * 0.6) * width;
        const cy = (0.15 + random(`by${b}`) * 0.4) * height;
        const color = b % 2 ? accent : COLORS[b % COLORS.length];
        const grow = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
        const fade = interpolate(f, [12, 34], [1, 0], clamp);
        return Array.from({ length: 26 }, (_, i) => {
          const a = (i / 26) * Math.PI * 2;
          const r = (180 + random(`r${b}${i}`) * 90) * k * grow;
          const drop = f * f * 0.08 * k;
          return <div key={`${b}-${i}`} style={{ position: "absolute", left: cx + Math.cos(a) * r, top: cy + Math.sin(a) * r + drop, width: 10 * k, height: 10 * k, borderRadius: 999, background: color, opacity: fade, boxShadow: `0 0 ${14 * k}px ${color}` }} />;
        });
      })}
    </div>
  );
}
