import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { EASE_OUT, In } from "../../motion";
import type { Cue, SceneProps } from "../../types";
import { appColors, Button, DrawCheck, modeOf, parts, ProductLayout, Surface, Tap, useAt } from "../../ui";

const PICK = 52;
const TAP = 82;

/** A payment sheet: the method is picked, Pay is tapped, and the sheet turns into a success screen. */
export default function Checkout({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const app = appColors(modeOf(theme), accent);
  const W = (shape === "tall" ? 820 : shape === "wide" ? 720 : 520) * k;
  const u = W / 100;
  const items = list(v, "items").slice(0, 4);
  const methods = list(v, "methods").slice(0, 3);
  const picked = Math.min(methods.length - 1, 1);
  const pick = useAt(PICK, 10);
  const success = useAt(TAP + 6, 18);
  const pressed = interpolate(frame, [TAP - 2, TAP + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 4 * u, fontWeight: 600, padding: `${2.2 * u}px 0` };
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={shape === "wide" ? 700 : undefined}>
      <In step={1} role="ui">
        <Surface app={app} k={k} radius={56} style={{ width: W, padding: `${6 * u}px ${6 * u}px`, position: "relative", overflow: "hidden", boxShadow: app.shadow, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif" }}>
          <div style={{ opacity: 1 - success, filter: `blur(${success * 8}px)` }}>
            <div style={{ width: 12 * u, height: 1.2 * u, borderRadius: 9, background: app.line, margin: `0 auto ${4 * u}px` }} />
            <div style={{ fontSize: 6.4 * u, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 2 * u }}>{str(v, "title")}</div>
            {items.map((r, i) => {
              const [name, price] = parts(r, 2);
              return (
                <In key={i} step={2 + i * 0.8} role="text">
                  <div style={{ ...row, borderBottom: `${0.25 * u}px solid ${app.line}`, color: app.sub }}>
                    <span>{name}</span>
                    <span style={{ color: app.text }}>{price}</span>
                  </div>
                </In>
              );
            })}
            <In step={2 + items.length * 0.8} role="text">
              <div style={{ ...row, fontSize: 5.2 * u, fontWeight: 800, paddingTop: 3 * u }}>
                <span>Total</span>
                <span>{str(v, "total")}</span>
              </div>
            </In>
            <In step={3 + items.length * 0.8} role="card">
              <div style={{ display: "flex", gap: 2 * u, margin: `${4 * u}px 0 ${5 * u}px` }}>
                {methods.map((m, i) => {
                  const on = i === picked ? pick : i === 0 ? 1 - pick : 0;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center", padding: `${3 * u}px 0`, borderRadius: 3.4 * u, fontSize: 3.8 * u, fontWeight: 700, background: on > 0.5 ? app.soft : app.surface2, boxShadow: `0 0 0 ${(0.25 + on * 0.35) * u}px ${on > 0.5 ? accent : app.line}`, color: on > 0.5 ? app.text : app.sub, scale: 1 + Math.sin(on * Math.PI) * 0.04 }}>
                      {m}
                    </div>
                  );
                })}
              </div>
            </In>
            <In step={4 + items.length * 0.8} role="chip">
              <Button label={str(v, "button")} app={app} k={u / 6} size={34} pressed={pressed} style={{ width: "100%", padding: `${4.4 * u}px 0` }} />
            </In>
          </div>
          <Tap at={TAP} x={W / 2} y={(59 + 9.8 * items.length) * u} k={k} />
          {/* Success screen. */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 * u, opacity: success, scale: 0.9 + success * 0.1 }}>
            <div style={{ width: 30 * u, height: 30 * u, borderRadius: "50%", display: "grid", placeItems: "center", background: `${accent}22`, scale: interpolate(success, [0, 1], [0.6, 1], { easing: EASE_OUT }) }}>
              <DrawCheck p={success} size={22 * u} color={accent} on={app.on} />
            </div>
            <div style={{ fontSize: 6.4 * u, fontWeight: 800 }}>{str(v, "done")}</div>
            <div style={{ fontSize: 5 * u, fontWeight: 700, color: app.sub }}>{str(v, "total")}</div>
          </div>
        </Surface>
      </In>
    </ProductLayout>
  );
}

export const cues = (): Cue[] => [
  { frame: PICK, sound: "click" },
  { frame: TAP, sound: "click" },
  { frame: TAP + 8, sound: "success" },
];
