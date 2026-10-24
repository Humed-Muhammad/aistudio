import { random } from "remotion";
import { num, useLife } from "../kit";
import type { ElementProps } from "../types";

const COLORS = ["#6EC1FF", "#FF6B8B", "#7CF2C4", "#B79CFF", "#FFFFFF", "#FF9F6E"];

export default function Confetti({ v, accent, durationInFrames, width, height, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 14);
  const n = Math.round(num(v, "amount"));
  const cx = num(v, "cx") * width;
  const cy = num(v, "cy") * height;
  const t = frame / fps;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      {Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (random(`a${i}`) - 0.5) * Math.PI * 1.3;
        const speed = (900 + random(`s${i}`) * 1300) * k;
        const drag = 1 - Math.exp(-t * 2.4);
        const x = cx + Math.cos(a) * speed * drag / 2.4;
        const y = cy + Math.sin(a) * speed * drag / 2.4 + 380 * k * t * t;
        const w = (14 + random(`w${i}`) * 14) * k;
        const flip = Math.cos(frame * (0.2 + random(`f${i}`) * 0.3) + i);
        const color = i % 7 === 0 ? accent : COLORS[i % COLORS.length];
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: w * 0.55, background: color, borderRadius: 2 * k, transform: `rotate(${frame * 6 + i * 37}deg) scaleY(${flip})` }} />;
      })}
    </div>
  );
}
