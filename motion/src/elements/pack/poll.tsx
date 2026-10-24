import { interpolate, Easing } from "remotion";
import { Starred, clamp, ease, fit, num, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function Poll({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const t = interpolate(frame, [14, 40], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const opts: [string, number][] = [[str(v, "a"), num(v, "a_pct")], [str(v, "b"), num(v, "b_pct")]];
  const best = opts[0][1] >= opts[1][1] ? 0 : 1;
  return (
    <div style={{ ...panel(theme, k, 32), width: 860 * k, padding: `${32 * k}px ${36 * k}px`, opacity: exit * box, transform: `scale(${0.95 + 0.05 * box})` }}>
      <Starred text={str(v, "question")} theme={theme} accent={accent} size={56 * theme.type * k} color={theme.text} align="left" style={{ marginBottom: 22 * k }} />
      {opts.map(([label, pct], i) => (
        <div key={i} style={{ position: "relative", height: 96 * k, marginTop: 14 * k, borderRadius: 22 * k, background: "rgba(255,255,255,.1)", overflow: "hidden", border: `${3 * k}px solid ${i === best && t > 0.95 ? accent : "transparent"}` }}>
          <div style={{ position: "absolute", inset: 0, width: `${pct * t}%`, background: i === best ? accent : "rgba(255,255,255,.28)", opacity: i === best ? 0.9 : 1 }} />
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%", padding: `0 ${26 * k}px`, fontFamily: theme.body, fontWeight: 800, fontSize: fit(label, 40 * k, 20), color: "#fff" }}>
            <span>{label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(pct * t)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
