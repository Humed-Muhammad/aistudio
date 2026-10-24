import { interpolate, spring } from "remotion";
import { clamp, fit, onAccent, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function PriceTag({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const swing = spring({ frame, fps, config: { damping: 6, stiffness: 90, mass: 0.8 } });
  const angle = (1 - swing) * -40;
  const strike = interpolate(frame, [18, 26], [0, 100], clamp);
  const old = str(v, "old");
  const price = str(v, "price");
  return (
    <div style={{ display: "grid", justifyItems: "center", opacity: exit * Math.min(1, frame / 4) }}>
      <div style={{ width: 4 * k, height: 110 * k, background: "rgba(255,255,255,.7)" }} />
      <div style={{ transform: `rotate(${angle}deg)`, transformOrigin: "50% 0" }}>
        <div style={{ position: "relative", padding: `${46 * k}px ${54 * k}px ${34 * k}px`, background: accent, color: onAccent(accent), borderRadius: `${24 * k}px ${24 * k}px ${30 * k}px ${30 * k}px`, clipPath: `polygon(50% 0, 100% ${70 * k}px, 100% 100%, 0 100%, 0 ${70 * k}px)`, textAlign: "center", boxShadow: `0 ${20 * k}px ${40 * k}px rgba(0,0,0,.35)`, minWidth: 360 * k }}>
          <div style={{ position: "absolute", left: "50%", top: 26 * k, width: 26 * k, height: 26 * k, marginLeft: -13 * k, borderRadius: 999, background: "rgba(0,0,0,.35)" }} />
          <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: fit(str(v, "label"), 36 * k, 16), opacity: 0.85, marginTop: 20 * k }}>{str(v, "label")}</div>
          <div style={{ fontFamily: theme.head, fontWeight: 900, fontSize: fit(price, 112 * k, 7), lineHeight: 1.05, whiteSpace: "nowrap" }}>{price}</div>
          {old ? (
            <div style={{ position: "relative", display: "inline-block", fontFamily: theme.body, fontWeight: 700, fontSize: 40 * k, opacity: 0.75 }}>
              {old}
              <div style={{ position: "absolute", left: 0, top: "52%", height: 5 * k, width: `${strike}%`, background: "currentColor", borderRadius: 3 * k }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
