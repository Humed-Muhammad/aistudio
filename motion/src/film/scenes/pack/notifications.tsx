import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { mix, onAccent } from "../../../colors";
import { beat, EASE_OUT, In } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { appColors, parts, Phone, ProductLayout } from "../../ui";

const FIRST = 2.5;
const EVERY = 3.4;

/** A lock screen: big clock, then notifications drop in on top, pushing older ones down. */
export default function Notifications({ v, theme, accent, accent2, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const items = list(v, "items").slice(0, 5);
  const app = appColors("dark", accent);
  const W = (shape === "tall" ? 560 : shape === "wide" ? 440 : 390) * k;
  const u = W / 100;
  const card = 21 * u;
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")}>
      <In step={1} role="ui">
        <Phone width={W} k={k} app={app}>
          {/* Wallpaper drawn from the film's colours. */}
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(90% 60% at 20% 10%, ${accent}cc, transparent 70%), radial-gradient(80% 60% at 90% 90%, ${accent2}bb, transparent 70%), linear-gradient(160deg, ${mix(accent, "#0b0c12", 0.6)}, #07080c)` }} />
          <div style={{ position: "relative", textAlign: "center", color: "#fff", marginTop: 4 * u }}>
            <div style={{ fontSize: 4.6 * u, fontWeight: 600, opacity: 0.85 }}>{str(v, "date")}</div>
            <div style={{ fontSize: 24 * u, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{str(v, "time")}</div>
          </div>
          <div style={{ position: "absolute", left: 5 * u, right: 5 * u, top: 60 * u }}>
            {items.map((row, i) => {
              const [icon, name, title, text] = parts(row, 4);
              const at = beat(FIRST + i * EVERY);
              const drop = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
              if (drop <= 0) return null;
              // How many newer notifications are above this one.
              const newer = items.slice(i + 1).reduce((n, _, j) => n + interpolate(frame, [beat(FIRST + (i + 1 + j) * EVERY), beat(FIRST + (i + 1 + j) * EVERY) + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT }), 0);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    translate: `0 ${newer * (card + 2.5 * u) - (1 - drop) * 14 * u}px`,
                    opacity: drop * (newer > 3.2 ? 0 : 1),
                    scale: 0.9 + 0.1 * drop,
                    display: "flex",
                    gap: 3 * u,
                    padding: `${3.4 * u}px ${3.6 * u}px`,
                    borderRadius: 5.5 * u,
                    background: "rgba(245,246,250,.82)",
                    backdropFilter: "blur(18px)",
                    color: "#0e1116",
                    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
                    zIndex: i,
                  }}
                >
                  <div style={{ width: 10 * u, height: 10 * u, borderRadius: 2.6 * u, flex: "none", display: "grid", placeItems: "center", background: `linear-gradient(145deg, ${mix(accent, "#ffffff", 0.2)}, ${accent})` }}>
                    <Icon name={icon || "bell"} size={5.6 * u} color={onAccent(accent)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 3.6 * u, color: "#5d6270", fontWeight: 600 }}>
                      <span>{name}</span>
                      <span>now</span>
                    </div>
                    <div style={{ fontSize: 4.4 * u, fontWeight: 800, marginTop: 0.4 * u }}>{title}</div>
                    <div style={{ fontSize: 4.1 * u, fontWeight: 500, color: "#2a2f3a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Phone>
      </In>
    </ProductLayout>
  );
}

export const cues = (v: Values): Cue[] => list(v, "items").slice(0, 5).map((_, i) => ({ frame: beat(FIRST + i * EVERY) + 2, sound: "pop" }));
