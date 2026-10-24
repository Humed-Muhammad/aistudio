import { interpolate } from "remotion";
import { clamp, fit, mix, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function MarkerText({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames);
  const swipe = interpolate(frame, [4, 18], [0, 100], clamp);
  const marker = str(v, "color") || accent;
  const text = str(v, "text");
  const size = fit(text, 92 * theme.type * k, 16);
  return (
    <div style={{ position: "relative", padding: `${size * 0.08}px ${size * 0.3}px`, opacity: exit, transform: `rotate(-2deg) scale(${0.96 + 0.04 * exit})` }}>
      <div style={{ position: "absolute", inset: `${size * 0.18}px 0`, background: marker, borderRadius: size * 0.12, clipPath: `inset(0 ${100 - swipe}% 0 0 round ${size * 0.12}px)`, opacity: 0.92 }} />
      <div style={{ position: "relative", fontFamily: theme.head, fontWeight: 900, fontSize: size, lineHeight: 1.15, whiteSpace: "nowrap", color: mix(marker, "#000000", 0.85), textTransform: theme.upper ? "uppercase" : undefined, letterSpacing: theme.tracking }}>
        {text}
      </div>
    </div>
  );
}
