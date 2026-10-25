import { interpolate, random, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { beat, EASE_OUT, In, useMotion } from "../../motion";
import type { Cue, SceneProps } from "../../types";
import { body, Glow, headline, Logo, Stage } from "../../ui";

const LAND = beat(0) + 12;

/** The mark lands with a burst of light and sparks; the name rises letter by letter under it. */
export default function LogoReveal({ v, theme, accent, accent2, shape, k, brand }: SceneProps) {
  const frame = useCurrentFrame();
  const name = str(v, "name") || brand.name;
  const { travel } = useMotion(0, "icon");
  const burst = interpolate(frame, [LAND - 2, LAND + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
  const size = (shape === "tall" ? 260 : 220) * k;
  const letters = [...name];
  return (
    <Stage shape={shape} k={k} gap={40}>
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        <Glow color={accent} size={size * 4} strength={0.35 * burst} style={{ left: "50%", top: "50%", translate: "-50% -50%" }} />
        <div style={{ position: "absolute", width: size * 1.2, height: size * 1.2, borderRadius: "50%", border: `${4 * k}px solid ${accent}`, opacity: (1 - burst) * (burst > 0 ? 1 : 0), scale: 0.8 + burst * 1.6 }} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + random(`a${i}`) * 0.4;
          const d = (0.7 + random(`d${i}`) * 0.6) * size * 1.3 * burst;
          return <i key={i} style={{ position: "absolute", width: 12 * k, height: 12 * k, borderRadius: "50%", background: i % 2 ? accent : accent2, translate: `${Math.cos(a) * d}px ${Math.sin(a) * d}px`, opacity: (1 - burst) * (burst > 0 ? 1 : 0), scale: 1 - burst * 0.6 }} />;
        })}
        <div style={{ scale: travel, rotate: `${(1 - Math.min(1, travel)) * -20}deg` }}>
          <Logo brand={brand} size={size} accent={accent} accent2={accent2} />
        </div>
      </div>
      <div style={{ ...headline(theme, (shape === "wide" ? 130 : 116) * k), display: "flex", justifyContent: "center", whiteSpace: "pre" }}>
        {letters.map((c, i) => (
          <In key={i} step={2} delay={i * 1.5} role="title">
            <span>{c}</span>
          </In>
        ))}
      </div>
      <In step={3 + letters.length * 0.3} role="text">
        <p style={{ ...body(theme, 40 * k) }}>{str(v, "tagline")}</p>
      </In>
    </Stage>
  );
}

export const cues = (): Cue[] => [
  { frame: 2, sound: "whoosh" },
  { frame: LAND, sound: "impact" },
];
