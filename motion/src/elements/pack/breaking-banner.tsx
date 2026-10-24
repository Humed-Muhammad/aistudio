import { ease, fit, onAccent, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function BreakingBanner({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const tag = ease(frame, fps, 0, 12);
  const bar = ease(frame, fps, 6, 20);
  const text = ease(frame, fps, 14, 16);
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: 980 * k, transform: `skewX(-8deg) translateX(${(1 - exit) * 60 * k}px)`, opacity: exit }}>
      <div style={{ background: accent, color: onAccent(accent), fontFamily: theme.head, fontWeight: 900, fontSize: 44 * k, padding: `${18 * k}px ${28 * k}px`, letterSpacing: "0.06em", transform: `scaleX(${tag})`, transformOrigin: "0 50%", zIndex: 1, boxShadow: `0 ${10 * k}px ${30 * k}px ${accent}55` }}>
        {str(v, "label")}
      </div>
      <div style={{ ...panel(theme, k, 6), flex: 1, display: "flex", alignItems: "center", padding: `0 ${28 * k}px`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, clipPath: `inset(0 ${(1 - bar) * 100}% 0 0)` }}>
        <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "headline"), 42 * theme.type * k, 26), letterSpacing: theme.tracking, whiteSpace: "nowrap", opacity: text, transform: `skewX(8deg) translateX(${(1 - text) * 30 * k}px)` }}>
          {str(v, "headline")}
        </div>
      </div>
    </div>
  );
}
