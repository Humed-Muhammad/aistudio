import { ease, fit, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function NameLowerThird({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const bar = ease(frame, fps, 0, 12);
  const box = ease(frame, fps, 5, 18);
  const name = ease(frame, fps, 10, 14);
  const role = ease(frame, fps, 16, 14);
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 18 * k, opacity: exit, transform: `translateX(${(1 - exit) * -40 * k}px)` }}>
      <div style={{ width: 12 * k, borderRadius: 6 * k, background: accent, transform: `scaleY(${bar})`, transformOrigin: "50% 100%", boxShadow: `0 0 ${24 * k}px ${accent}88` }} />
      <div style={{ ...panel(theme, k, 22), padding: `${22 * k}px ${36 * k}px`, minWidth: 420 * k, clipPath: `inset(0 ${(1 - box) * 100}% 0 0 round ${22 * theme.radius * k}px)` }}>
        <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "name"), 58 * theme.type * k, 18), lineHeight: 1.05, letterSpacing: theme.tracking, textTransform: theme.upper ? "uppercase" : undefined, whiteSpace: "nowrap", opacity: name, transform: `translateY(${(1 - name) * 16 * k}px)` }}>
          {str(v, "name")}
        </div>
        <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: fit(str(v, "role"), 34 * k, 32), color: theme.sub, marginTop: 6 * k, whiteSpace: "nowrap", opacity: role, transform: `translateY(${(1 - role) * 12 * k}px)` }}>
          {str(v, "role")}
        </div>
      </div>
    </div>
  );
}
