import { Starred, ease, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function WarningBanner({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const band = ease(frame, fps, 0, 12);
  const icon = pop(frame, fps, 8, 9);
  const color = str(v, "color") || "#FF6B4A";
  const stripes = `repeating-linear-gradient(-45deg, ${color} 0 ${22 * k}px, #1b1d24 ${22 * k}px ${44 * k}px)`;
  return (
    <div style={{ width: 1000 * k, display: "grid", gap: 0, opacity: exit, transform: `rotate(-3deg) scaleX(${band})` }}>
      <div style={{ height: 22 * k, background: stripes, backgroundPosition: `${frame * 2}px 0` }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 * k, padding: `${20 * k}px ${30 * k}px`, background: "rgba(15,17,22,.88)" }}>
        <span style={{ fontSize: 70 * k, transform: `scale(${icon})` }}>⚠️</span>
        <Starred text={str(v, "text")} theme={theme} accent={color || accent} size={60 * theme.type * k} color="#fff" />
      </div>
      <div style={{ height: 22 * k, background: stripes, backgroundPosition: `${-frame * 2}px 0` }} />
    </div>
  );
}
