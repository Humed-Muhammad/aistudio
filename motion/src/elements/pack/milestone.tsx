import { random } from "remotion";
import { ease, fit, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Milestone({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const trophy = pop(frame, fps, 0, 9);
  const big = pop(frame, fps, 8, 11);
  const label = ease(frame, fps, 16, 14);
  return (
    <div style={{ position: "relative", display: "grid", justifyItems: "center", width: 760 * k, opacity: exit }}>
      {Array.from({ length: 14 }, (_, i) => {
        const a = random(`m${i}`) * Math.PI * 2;
        const r = (220 + random(`r${i}`) * 160) * k;
        const tw = 0.5 + 0.5 * Math.sin(frame / 5 + i);
        return <div key={i} style={{ position: "absolute", left: "50%", top: 220 * k, transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r * 0.6}px) scale(${tw * trophy})`, fontSize: (24 + random(`s${i}`) * 26) * k, color: i % 3 ? "#fff" : accent }}>✦</div>;
      })}
      <div style={{ fontSize: 200 * k, lineHeight: 1, transform: `scale(${trophy}) rotate(${(1 - trophy) * -20}deg)`, filter: `drop-shadow(0 ${12 * k}px ${30 * k}px rgba(0,0,0,.4))` }}>🏆</div>
      <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(str(v, "value"), 190 * k, 4), lineHeight: 1, background: `linear-gradient(180deg, #ffffff 20%, ${accent})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", transform: `scale(${big})`, filter: `drop-shadow(0 ${8 * k}px ${24 * k}px ${accent}55)` }}>{str(v, "value")}</div>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "label"), 54 * theme.type * k, 24), color: "#fff", opacity: label, textShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,.5)` }}>{str(v, "label")}</div>
    </div>
  );
}
