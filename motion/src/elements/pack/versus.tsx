import { ease, fit, onAccent, panel, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Versus({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const l = ease(frame, fps, 0, 16);
  const r = ease(frame, fps, 6, 16);
  const vs = pop(frame, fps, 14, 9);
  const side = (title: string, note: string, hot: boolean, t: number, dir: number) => (
    <div style={{ ...panel(theme, k, 28), width: 360 * k, padding: `${34 * k}px ${26 * k}px`, textAlign: "center", opacity: t, transform: `translateX(${(1 - t) * dir * 200 * k}px)`, borderColor: hot ? accent : theme.border, boxShadow: hot ? `${theme.shadow}, 0 0 ${40 * k}px ${accent}55` : theme.shadow }}>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(title, 50 * theme.type * k, 9), color: hot ? accent : theme.text, whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: fit(note, 34 * k, 18), color: theme.sub, marginTop: 10 * k }}>{note}</div>
    </div>
  );
  return (
    <div style={{ position: "relative", display: "flex", gap: 130 * k, alignItems: "center", opacity: exit }}>
      {side(str(v, "left"), str(v, "left_note"), false, l, -1)}
      {side(str(v, "right"), str(v, "right_note"), true, r, 1)}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 110 * k, height: 110 * k, marginLeft: -55 * k, marginTop: -55 * k, borderRadius: 999, background: accent, color: onAccent(accent), display: "grid", placeItems: "center", fontFamily: theme.head, fontWeight: 900, fontSize: 46 * k, transform: `scale(${vs}) rotate(${(1 - vs) * -90}deg)`, boxShadow: `0 ${10 * k}px ${30 * k}px rgba(0,0,0,.4)` }}>VS</div>
    </div>
  );
}
