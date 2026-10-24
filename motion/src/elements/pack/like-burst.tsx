import { interpolate, random } from "remotion";
import { clamp, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function LikeBurst({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 8);
  const heart = pop(frame, fps, 0, 8);
  const burst = interpolate(frame, [2, 20], [0, 1], clamp);
  const color = str(v, "color") || "#FF4D6D";
  const caption = str(v, "caption");
  return (
    <div style={{ position: "relative", display: "grid", justifyItems: "center", opacity: exit }}>
      <div style={{ position: "relative", width: 320 * k, height: 320 * k }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + random(`a${i}`) * 0.3;
          const d = (90 + random(`d${i}`) * 70) * burst * k;
          return <div key={i} style={{ position: "absolute", left: 160 * k + Math.cos(a) * d - 9 * k, top: 160 * k + Math.sin(a) * d - 9 * k, width: 18 * k, height: 18 * k, borderRadius: 999, background: i % 2 ? color : "#ffffff", opacity: 1 - burst, transform: `scale(${1 - burst * 0.5})` }} />;
        })}
        <svg width={220 * k} height={200 * k} viewBox="0 0 24 22" style={{ position: "absolute", left: 50 * k, top: 60 * k, transform: `scale(${heart})`, filter: `drop-shadow(0 ${10 * k}px ${24 * k}px ${color}88)` }}>
          <path d="M12 21s-8.6-5.3-10.8-10.3C-.2 6.1 3 1.8 7.1 2.1c2 .1 3.6 1.3 4.9 3 1.3-1.7 2.9-2.9 4.9-3 4.1-.3 7.3 4 5.9 8.6C20.6 15.7 12 21 12 21z" fill={color} />
        </svg>
      </div>
      {caption ? <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: 56 * k, color: "#fff", textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)`, whiteSpace: "nowrap" }}>{caption}</div> : null}
    </div>
  );
}
