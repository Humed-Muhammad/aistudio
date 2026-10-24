import { random } from "remotion";
import { num, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function EmojiRain({ v, durationInFrames, width, height, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames, 12);
  const set = [...str(v, "emoji").replace(/\s/g, "")].filter((c) => c !== "️");
  const n = Math.round(num(v, "amount"));
  if (!set.length) return null;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      {Array.from({ length: n }, (_, i) => {
        const x = random(`x${i}`) * width;
        const delay = random(`d${i}`) * durationInFrames * 0.6;
        const speed = (14 + random(`s${i}`) * 16) * k;
        const size = (60 + random(`z${i}`) * 70) * k;
        const y = -size + Math.max(0, frame - delay) * speed;
        if (y > height + size) return null;
        const sway = Math.sin((frame + i * 13) / 9) * 20 * k;
        return <div key={i} style={{ position: "absolute", left: x + sway, top: y, fontSize: size, transform: `rotate(${(random(`r${i}`) - 0.5) * 60 + frame * (random(`w${i}`) - 0.5) * 4}deg)` }}>{set[i % set.length]}</div>;
      })}
    </div>
  );
}
