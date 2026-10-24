import { interpolate } from "remotion";
import { clamp, ease, fit, mix, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function WordHighlight({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const appear = ease(frame, fps, 0, 12);
  const text = str(v, "text");
  const words = text.split(/\s+/).filter(Boolean);
  const at = interpolate(frame, [8, durationInFrames * 0.8], [0, words.length], clamp);
  const size = fit(text, 84 * theme.type * k, 26);
  return (
    <div style={{ width: 960 * k, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `${size * 0.18}px ${size * 0.22}px`, opacity: exit * appear }}>
      {words.map((w, i) => {
        const on = Math.max(0, Math.min(1, at - i));
        return (
          <span key={i} style={{ fontFamily: theme.head, fontWeight: 900, fontSize: size, lineHeight: 1.15, padding: `0 ${size * 0.14}px`, borderRadius: size * 0.16, color: on > 0.5 ? mix(accent, "#000000", 0.85) : "#ffffff", background: `linear-gradient(90deg, ${accent} ${on * 100}%, transparent ${on * 100}%)`, textShadow: on > 0.5 ? undefined : `0 ${3 * k}px ${14 * k}px rgba(0,0,0,.55)`, letterSpacing: theme.tracking }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}
