import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, EASE_OUT, In, useCount, useProgress, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, appColors, Button, DrawCheck, fitSize, headline, modeOf, parts, Phone, Tap, useAt } from "../../ui";

const ROW0 = 3;
/** Frame the button is tapped: after the last row has landed. */
const tapAt = (rows: number) => beat(ROW0 + rows * 0.9 + 1.5) + 14;

/** An app screen on a phone: rows slide in, the button is tapped, a success message drops in. */
export default function PhoneApp({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const rows = list(v, "rows").slice(0, 5);
  const app = appColors(modeOf(theme), accent);
  const tall = shape === "tall";
  const W = (tall ? 560 : shape === "wide" ? 440 : 390) * k;
  const [sumLabel, sumValue] = parts(str(v, "summary"), 2);
  const sumShown = useCount(sumValue, 2.5, 34);
  const spark = useProgress(beat(2.5), 30);
  const tap = tapAt(rows.length);
  const done = useAt(tap + 4, 18);
  const caption = str(v, "caption");
  const capSize = fitSize(caption, (tall ? 88 : shape === "wide" ? 96 : 66) * k, tall ? 26 : 22);
  // The phone turns gently towards the viewer as the scene plays.
  const turn = interpolate(frame, [0, 120], [1, 0], { extrapolateRight: "clamp", easing: EASE_OUT });
  const u = W / 100; // screen unit: 1 % of the phone width
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: tall ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: (tall ? 70 : 110) * k,
        padding: tall ? `${170 * k}px ${80 * k}px ${300 * k}px` : `${80 * k}px ${120 * k}px`,
      }}
    >
      {caption ? (
        <h2 style={{ ...headline(theme, capSize), maxWidth: (tall ? 900 : shape === "wide" ? 760 : 420) * k, textAlign: tall ? "center" : "left" }}>
          <Words text={caption} step={0} accentStyle={accentWord(theme, accent, capSize)} />
        </h2>
      ) : null}
      <div style={{ perspective: 2400 * k, flex: "none" }}>
        <In step={1} role="ui">
          <div style={{ transform: `rotateX(${10 * turn + 3}deg) rotateY(${(tall ? -6 : -14) * turn - 4}deg)` }}>
            <Phone width={W} k={k} app={app}>
              <div style={{ padding: `${2 * u}px ${6.5 * u}px` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2.5 * u, color: app.sub, fontSize: 4.6 * u, fontWeight: 600 }}>
                  <div style={{ width: 6.5 * u, height: 6.5 * u, borderRadius: 2 * u, background: `linear-gradient(145deg, ${mix(accent, "#ffffff", 0.25)}, ${accent})` }} />
                  {str(v, "app")}
                </div>
                <div style={{ fontSize: 10 * u, fontWeight: 800, letterSpacing: "-0.02em", margin: `${3 * u}px 0 ${4.5 * u}px` }}>{str(v, "title")}</div>
                {sumValue ? (
                  <In step={2} role="card">
                    <div style={{ position: "relative", overflow: "hidden", borderRadius: 6 * u, padding: `${5 * u}px ${5.5 * u}px`, marginBottom: 4.5 * u, color: app.on, background: `linear-gradient(135deg, ${mix(accent, "#ffffff", 0.18)}, ${accent} 55%, ${mix(accent, "#000000", 0.18)})`, boxShadow: `0 ${3 * u}px ${8 * u}px ${accent}55` }}>
                      <div style={{ fontSize: 4.4 * u, fontWeight: 600, opacity: 0.85 }}>{sumLabel}</div>
                      <div style={{ fontSize: 11 * u, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginTop: 1 * u }}>{sumShown}</div>
                      <svg width={36 * u} height={14 * u} viewBox="0 0 100 40" style={{ position: "absolute", right: 4 * u, bottom: 4 * u, opacity: 0.85 }}>
                        <path d="M0 34 C 15 30, 22 18, 35 22 S 58 30, 68 16 S 88 8, 100 4" fill="none" stroke={app.on} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={140} strokeDashoffset={140 * (1 - spark)} />
                      </svg>
                      <div style={{ position: "absolute", right: -8 * u, top: -10 * u, width: 30 * u, height: 30 * u, borderRadius: "50%", background: "rgba(255,255,255,.14)" }} />
                    </div>
                  </In>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 * u }}>
                  {rows.map((row, i) => {
                    const [icon, title, value] = parts(row, 3);
                    return (
                      <In key={i} step={ROW0 + i * 0.9} role="card">
                        <div style={{ display: "flex", alignItems: "center", gap: 3.2 * u, padding: `${3.4 * u}px ${3.6 * u}px`, borderRadius: 4.5 * u, background: app.surface, boxShadow: `0 ${1.2 * u}px ${3.5 * u}px rgba(20,30,60,.08), 0 0 0 ${0.3 * u}px ${app.line}` }}>
                          <div style={{ width: 10.5 * u, height: 10.5 * u, borderRadius: 3.2 * u, display: "grid", placeItems: "center", background: app.soft, flex: "none" }}>
                            <Icon name={icon || "check"} size={5.6 * u} color={accent} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 5 * u, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                          <div style={{ fontSize: 5 * u, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                          {done > 0 ? <DrawCheck p={done} size={6 * u} color={accent} on={app.on} /> : null}
                        </div>
                      </In>
                    );
                  })}
                </div>
              </div>
              <div style={{ position: "absolute", left: 7 * u, right: 7 * u, bottom: 9 * u }}>
                <In step={ROW0 + rows.length * 0.9 + 0.6} role="chip">
                  <Button label={str(v, "button")} app={app} k={u / 6} size={30} pressed={interpolate(frame, [tap - 2, tap + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} style={{ width: "100%", padding: `${4.6 * u}px 0` }} />
                </In>
              </div>
              <Tap at={tap} x={50 * u} y={W * 2.05 - 0.035 * W * 2 - 17 * u} k={u / 6} />
              {/* Success message dropping from the top of the screen. */}
              <div
                style={{
                  position: "absolute",
                  left: 5 * u,
                  right: 5 * u,
                  top: 12 * u,
                  zIndex: 6,
                  translate: `0 ${(1 - done) * -30 * u}px`,
                  opacity: done,
                  display: "flex",
                  alignItems: "center",
                  gap: 3 * u,
                  padding: `${3.4 * u}px ${4 * u}px`,
                  borderRadius: 5 * u,
                  background: app.bg === "#0d0f14" ? "rgba(40,44,56,.92)" : "rgba(255,255,255,.96)",
                  boxShadow: "0 12px 30px rgba(0,0,0,.18)",
                  fontSize: 5 * u,
                  fontWeight: 700,
                }}
              >
                <DrawCheck p={done} size={8 * u} color={accent} on={app.on} />
                {str(v, "toast")}
              </div>
            </Phone>
          </div>
        </In>
      </div>
    </div>
  );
}

export const cues = (v: Values): Cue[] => {
  const n = list(v, "rows").slice(0, 5).length;
  const tap = tapAt(n);
  return [
    ...Array.from({ length: n }, (_, i) => ({ frame: beat(ROW0 + i * 0.9) + 3, sound: "click" as const })),
    { frame: tap, sound: "click" },
    { frame: tap + 6, sound: "success" },
  ];
};
