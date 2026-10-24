import { Starred, fit, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function CouponTicket({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 11);
  const code = pop(frame, fps, 12, 10);
  const notch = 34 * k;
  const ink = onAccent(accent);
  return (
    <div style={{ position: "relative", width: 820 * k, display: "flex", borderRadius: 30 * k, background: accent, color: ink, boxShadow: `0 ${20 * k}px ${44 * k}px rgba(0,0,0,.35)`, transform: `rotate(-3deg) scale(${s})`, opacity: exit, WebkitMaskImage: `radial-gradient(circle ${notch}px at 0 50%, transparent 98%, #000), radial-gradient(circle ${notch}px at 100% 50%, transparent 98%, #000)`, WebkitMaskComposite: "source-in", maskComposite: "intersect" }}>
      <div style={{ flex: 1, padding: `${40 * k}px ${50 * k}px`, borderRight: `${4 * k}px dashed ${ink}55` }}>
        <Starred text={str(v, "offer")} theme={theme} accent={ink} size={fit(str(v, "offer"), 110 * k, 8)} color={ink} weight={900} align="left" />
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 38 * k, opacity: 0.85 }}>{str(v, "detail")}</div>
      </div>
      <div style={{ width: 280 * k, display: "grid", placeItems: "center", padding: 24 * k }}>
        <div style={{ textAlign: "center", transform: `scale(${code})` }}>
          <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 26 * k, opacity: 0.8 }}>CODE</div>
          <div style={{ marginTop: 8 * k, padding: `${10 * k}px ${16 * k}px`, border: `${3 * k}px dashed ${ink}`, borderRadius: 14 * k, fontFamily: "ui-monospace, monospace", fontWeight: 800, fontSize: fit(str(v, "code"), 44 * k, 8), letterSpacing: "0.06em" }}>{str(v, "code")}</div>
        </div>
      </div>
    </div>
  );
}
