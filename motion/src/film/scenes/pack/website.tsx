import { interpolate, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, In, Words } from "../../motion";
import type { Cue, SceneProps } from "../../types";
import { accentWord, appColors, Browser, Button, Cursor, fitSize, Logo, modeOf, useAt, useTyped } from "../../ui";

const TYPE = 1.5;
const CLICK = 86;

/** A landing page in a browser: the address types, the page builds, the cursor clicks the call to action. */
export default function Website({ v, theme, accent, accent2, shape, k, brand }: SceneProps) {
  const frame = useCurrentFrame();
  const app = appColors(modeOf(theme), accent);
  const tall = shape === "tall";
  const W = (tall ? 940 : shape === "wide" ? 1500 : 940) * k;
  const H = (tall ? 1180 : shape === "wide" ? 860 : 820) * k;
  const url = str(v, "url");
  const typed = useTyped(url, beat(TYPE), 26);
  const done = useAt(CLICK + 4, 14);
  const headlineText = str(v, "headline");
  const size = fitSize(headlineText, (tall ? 92 : 88) * k, 28);
  // Where the button sits, for the cursor (page coordinates).
  const btn = { x: W / 2, y: (tall ? 730 : shape === "wide" ? 560 : 560) * k };
  const pressed = interpolate(frame, [CLICK - 2, CLICK + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", perspective: 2600 * k }}>
      <In step={0} role="ui">
        <div style={{ transform: `rotateX(${tall ? 4 : 8}deg)` }}>
          <Browser width={W} height={H} k={k} app={app} url={url ? (typed.done ? url : typed.text) : ""} typed={typed.done ? 1 : 0.5}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: "50%", top: "-30%", width: W * 1.1, height: W * 0.8, translate: "-50% 0", background: `radial-gradient(closest-side, ${accent}40, transparent), radial-gradient(40% 40% at 70% 60%, ${accent2}30, transparent)` }} />
              <In step={TYPE + 3} role="fade">
                <div style={{ display: "flex", alignItems: "center", gap: 16 * k, padding: `${28 * k}px ${44 * k}px`, color: app.text }}>
                  <Logo brand={{ ...brand, name: str(v, "brand") || brand.name }} size={44 * k} accent={accent} accent2={accent2} />
                  <b style={{ fontSize: 30 * k }}>{str(v, "brand") || brand.name}</b>
                  <span style={{ flex: 1 }} />
                  {[90, 70, 80].map((w, i) => (
                    <i key={i} style={{ width: w * k, height: 14 * k, borderRadius: 8 * k, background: app.line, marginLeft: 26 * k }} />
                  ))}
                </div>
              </In>
              <div style={{ position: "absolute", left: 0, right: 0, top: (tall ? 200 : 150) * k, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 * k, padding: `0 ${70 * k}px`, textAlign: "center" }}>
                <div style={{ fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif", fontWeight: 800, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.03em", color: app.text, maxWidth: 820 * k, textWrap: "balance" }}>
                  <Words text={headlineText} step={TYPE + 4} accentStyle={accentWord({ ...theme, accent: "color" }, accent, size)} />
                </div>
                <In step={TYPE + 7} role="text">
                  <p style={{ margin: 0, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif", fontSize: 32 * k, color: app.sub, maxWidth: 700 * k, lineHeight: 1.35 }}>{str(v, "sub")}</p>
                </In>
              </div>
              <div style={{ position: "absolute", left: btn.x, top: btn.y, translate: "-50% -50%" }}>
                <In step={TYPE + 8} role="chip">
                  <Button label={done > 0.5 ? str(v, "done") : str(v, "button")} app={app} k={k} size={36} pressed={pressed} done={done > 0.5} />
                </In>
              </div>
              {tall ? (
                <In step={TYPE + 9} role="card" style={{ position: "absolute", left: 70 * k, right: 70 * k, top: 860 * k }}>
                  <div style={{ display: "flex", gap: 20 * k }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ flex: 1, height: 150 * k, borderRadius: 24 * k, background: app.surface, boxShadow: `0 0 0 ${1.5 * k}px ${app.line}`, padding: 22 * k }}>
                        <i style={{ display: "block", width: 46 * k, height: 46 * k, borderRadius: 14 * k, background: i === 1 ? accent : mix(accent, app.surface, 0.75) }} />
                        <i style={{ display: "block", width: "70%", height: 12 * k, borderRadius: 6 * k, background: app.line, marginTop: 20 * k }} />
                        <i style={{ display: "block", width: "45%", height: 12 * k, borderRadius: 6 * k, background: app.line, marginTop: 10 * k }} />
                      </div>
                    ))}
                  </div>
                </In>
              ) : null}
              <Cursor
                k={k}
                path={[
                  { at: CLICK - 26, x: W * 0.82, y: H * 0.85 },
                  { at: CLICK - 2, x: btn.x + 20 * k, y: btn.y + 10 * k },
                  { at: CLICK, x: btn.x + 20 * k, y: btn.y + 10 * k, click: true },
                  { at: CLICK + 30, x: btn.x + 40 * k, y: btn.y + 30 * k },
                ]}
              />
            </div>
          </Browser>
        </div>
      </In>
    </div>
  );
}

export const cues = (): Cue[] => [
  { frame: CLICK, sound: "click" },
  { frame: CLICK + 6, sound: "success" },
];
