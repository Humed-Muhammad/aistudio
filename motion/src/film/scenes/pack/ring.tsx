import { interpolate, useCurrentFrame } from "remotion";
import { num, str, useSvgId } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, EASE_OUT, In, Words } from "../../motion";
import type { Cue, SceneProps } from "../../types";
import { accentWord, fitSize, Glow, headline, Kicker, Stage } from "../../ui";

const FILL = 44;

/** A ring fills to the percentage while the number counts inside it. */
export default function Ring({ v, theme, accent, accent2, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const value = Math.max(0, Math.min(100, num(v, "value")));
  const p = interpolate(frame, [beat(1), beat(1) + FILL], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
  const id = useSvgId("ring");
  const R = 42;
  const C = 2 * Math.PI * R;
  const size = (shape === "tall" ? 560 : 480) * k;
  const title = str(v, "title");
  const ts = fitSize(title, (shape === "wide" ? 72 : 64) * k, 34);
  const ink = theme.ink ?? theme.text;
  return (
    <Stage shape={shape} k={k} row gap={shape === "wide" ? 110 : 50}>
      <In step={0} role="card" style={{ position: "relative", flex: "none" }}>
        <Glow color={accent} size={size * 1.6} strength={0.3} style={{ left: "50%", top: "50%", translate: "-50% -50%" }} />
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "relative", rotate: "-90deg" }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={mix(accent, "#ffffff", 0.3)} />
              <stop offset="1" stopColor={accent2} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={R} fill="none" stroke={`${mix(accent, ink, 0.6)}33`} strokeWidth={9} />
          <circle cx="50" cy="50" r={R} fill="none" stroke={`url(#${id})`} strokeWidth={9} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (value / 100) * p)} style={{ filter: `drop-shadow(0 0 3px ${accent}aa)` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ ...headline(theme, size * 0.27), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>
            {Math.round(value * p)}
            <span style={{ fontSize: size * 0.13, color: accent }}>%</span>
          </div>
        </div>
      </In>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 * k, alignItems: shape === "wide" ? "flex-start" : "center", maxWidth: 820 * k }}>
        <In step={2} role="chip">
          <Kicker text={str(v, "kicker")} theme={theme} accent={accent} k={k} />
        </In>
        <h2 style={{ ...headline(theme, ts) }}>
          <Words text={title} step={2.6} accentStyle={accentWord(theme, accent, ts)} />
        </h2>
      </div>
    </Stage>
  );
}

export const cues = (): Cue[] => [{ frame: beat(1) + FILL - 6, sound: "pop" }];
