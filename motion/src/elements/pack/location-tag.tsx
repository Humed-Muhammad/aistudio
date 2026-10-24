import { ease, fit, panel, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function LocationTag({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const pin = pop(frame, fps, 0, 10);
  const open = ease(frame, fps, 8, 18);
  const detail = str(v, "detail");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 * k, opacity: exit, transform: `scale(${0.9 + 0.1 * exit})` }}>
      <svg width={84 * k} height={104 * k} viewBox="0 0 84 104" style={{ transform: `translateY(${(1 - pin) * -60 * k}px)`, opacity: Math.min(1, pin * 2), filter: `drop-shadow(0 ${10 * k}px ${14 * k}px rgba(0,0,0,.35))` }}>
        <path d="M42 102C42 102 6 62 6 40a36 36 0 0 1 72 0c0 22-36 62-36 62z" fill={accent} />
        <circle cx="42" cy="40" r="14" fill="#fff" />
      </svg>
      <div style={{ ...panel(theme, k, 20), padding: `${16 * k}px ${30 * k}px`, clipPath: `inset(0 ${(1 - open) * 100}% 0 0 round ${20 * theme.radius * k}px)` }}>
        <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "place"), 48 * theme.type * k, 22), letterSpacing: theme.tracking, whiteSpace: "nowrap" }}>{str(v, "place")}</div>
        {detail ? <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: 30 * k, color: theme.sub, whiteSpace: "nowrap" }}>{detail}</div> : null}
      </div>
    </div>
  );
}
