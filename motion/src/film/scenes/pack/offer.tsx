import { interpolate, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { mix, onAccent } from "../../../colors";
import { beat, EASE_OUT, In, useMotion, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { accentWord, fitSize, Glow, headline, Kicker, Stage } from "../../ui";

const STRIKE = beat(4);

/** A starburst badge spins in, the old price is struck through, the new one drops in big. */
export default function Offer({ v, theme, accent, accent2, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const { travel } = useMotion(0, "icon");
  const strike = interpolate(frame, [STRIKE, STRIKE + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
  const title = str(v, "title");
  const ts = fitSize(title, (shape === "wide" ? 86 : 78) * k, 26);
  const badge = (shape === "tall" ? 330 : 280) * k;
  const points = Array.from({ length: 32 }, (_, i) => {
    const r = i % 2 ? 41 : 50;
    const a = (i / 32) * Math.PI * 2;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  const ink = theme.ink ?? theme.text;
  return (
    <Stage shape={shape} k={k} row gap={shape === "wide" ? 110 : 44}>
      <div style={{ position: "relative", flex: "none", scale: travel, rotate: `${(1 - Math.min(1, travel)) * -90 + frame * 0.25}deg` }}>
        <Glow color={accent} size={badge * 2} strength={0.35} style={{ left: "50%", top: "50%", translate: "-50% -50%" }} />
        <svg width={badge} height={badge} viewBox="0 0 100 100" style={{ position: "relative", filter: `drop-shadow(0 ${12 * k}px ${24 * k}px ${accent}66)` }}>
          <polygon points={points} fill={accent} />
          <circle cx="50" cy="50" r="36" fill="none" stroke={mix(accent, "#ffffff", 0.45)} strokeWidth={1} strokeDasharray="2 2" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", rotate: `${-frame * 0.25}deg`, ...headline(theme, badge * 0.27, onAccent(accent)), textTransform: "none" }}>{str(v, "badge")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 * k, alignItems: shape === "wide" ? "flex-start" : "center" }}>
        <h2 style={{ ...headline(theme, ts), maxWidth: 860 * k }}>
          <Words text={title} step={1.5} accentStyle={accentWord(theme, accent, ts)} />
        </h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 30 * k }}>
          <In step={3} role="text">
            <span style={{ position: "relative", ...headline(theme, 72 * k, theme.inkSub ?? theme.sub), fontWeight: 600 }}>
              {str(v, "old")}
              <i style={{ position: "absolute", left: -6 * k, top: "52%", height: 7 * k, width: `calc(${strike * 100}% + ${12 * k}px)`, background: mix(accent2, "#ff5a5a", 0.5), borderRadius: 4 * k, rotate: "-8deg" }} />
            </span>
          </In>
          <In step={5} role="number">
            <span style={{ ...headline(theme, 168 * k, ink), letterSpacing: "-0.04em" }}>{str(v, "new")}</span>
          </In>
        </div>
        <In step={6.5} role="chip">
          <Kicker text={str(v, "note")} theme={theme} accent={accent} k={k} icon={<Icon name="timer" size={30 * k} color={accent} />} />
        </In>
      </div>
    </Stage>
  );
}

export const cues = (): Cue[] => [
  { frame: beat(0) + 4, sound: "pop" },
  { frame: STRIKE + 2, sound: "click" },
  { frame: beat(5) + 4, sound: "pop" },
];
