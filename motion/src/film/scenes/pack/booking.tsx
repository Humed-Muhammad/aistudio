import { interpolate } from "remotion";
import { list, num, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { EASE_OUT, In } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { appColors, DrawCheck, modeOf, ProductLayout, Surface, useAt } from "../../ui";

const DAY = 40;
const SLOT = 72;
const DONE = 96;

/** A month calendar: the day lights up, slots slide in, one is chosen, the booking confirms. */
export default function Booking({ v, theme, accent, shape, k }: SceneProps) {
  const app = appColors(modeOf(theme), accent);
  const W = (shape === "tall" ? 840 : shape === "wide" ? 720 : 520) * k;
  const u = W / 100;
  const first = Math.max(0, Math.min(6, Math.round(num(v, "first"))));
  const days = Math.max(28, Math.min(31, Math.round(num(v, "days"))));
  const day = Math.max(1, Math.min(days, Math.round(num(v, "day"))));
  const slots = list(v, "slots").slice(0, 6);
  const pick = Math.max(0, Math.min(slots.length - 1, Math.round(num(v, "pick")) - 1));
  const dayOn = useAt(DAY, 12);
  const slotOn = useAt(SLOT, 10);
  const done = useAt(DONE, 16);
  const cells = Array.from({ length: first + days }, (_, i) => (i < first ? 0 : i - first + 1));
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={shape === "wide" ? 700 : undefined}>
      <In step={1} role="ui">
        <Surface app={app} k={k} radius={56} style={{ width: W, padding: 6 * u, boxShadow: app.shadow, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 * u }}>
            <b style={{ fontSize: 5.6 * u, letterSpacing: "-0.02em" }}>{str(v, "month")}</b>
            <span style={{ display: "flex", gap: 2 * u, color: app.sub }}>
              <Icon name="chevron-right" size={5 * u} color={app.sub} style={{ rotate: "180deg" }} />
              <Icon name="chevron-right" size={5 * u} color={app.sub} />
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 1.4 * u, textAlign: "center", fontSize: 3.6 * u }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} style={{ color: app.sub, fontWeight: 700, paddingBottom: 1.4 * u }}>{d}</span>
            ))}
            {cells.map((d, i) => {
              const on = d === day ? dayOn : 0;
              return (
                <span key={i} style={{ position: "relative", height: 9 * u, display: "grid", placeItems: "center", fontWeight: on > 0.5 ? 800 : 600, color: on > 0.5 ? app.on : d ? app.text : "transparent" }}>
                  {on > 0 ? <i style={{ position: "absolute", width: 9 * u, height: 9 * u, borderRadius: "50%", background: accent, scale: interpolate(on, [0, 1], [0.3, 1], { easing: EASE_OUT }), boxShadow: `0 ${1 * u}px ${3 * u}px ${accent}66` }} /> : null}
                  <span style={{ position: "relative" }}>{d || ""}</span>
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 * u, marginTop: 4 * u }}>
            {slots.map((s, i) => {
              const on = i === pick ? slotOn : 0;
              return (
                <In key={i} step={0} delay={DAY + 10 + i * 4 - 6} role="chip">
                  <span style={{ display: "inline-block", padding: `${2.4 * u}px ${4.2 * u}px`, borderRadius: 99, fontSize: 3.8 * u, fontWeight: 700, background: on > 0.5 ? accent : app.surface2, color: on > 0.5 ? app.on : app.text, boxShadow: `0 0 0 ${0.25 * u}px ${on > 0.5 ? accent : app.line}`, scale: 1 + Math.sin(on * Math.PI) * 0.08 }}>
                    {s}
                  </span>
                </In>
              );
            })}
          </div>
          {/* Confirmation bar sliding up from the bottom of the card. */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 * u, marginTop: 5 * u, padding: `${3.4 * u}px ${4 * u}px`, borderRadius: 4 * u, background: mix(accent, app.surface, 0.85), opacity: done, translate: `0 ${(1 - done) * 4 * u}px`, fontSize: 4.2 * u, fontWeight: 800 }}>
            <DrawCheck p={done} size={8 * u} color={accent} on={app.on} />
            {str(v, "done")}
          </div>
        </Surface>
      </In>
    </ProductLayout>
  );
}

export const cues = (): Cue[] => [
  { frame: DAY, sound: "click" },
  { frame: SLOT, sound: "click" },
  { frame: DONE + 2, sound: "success" },
];
