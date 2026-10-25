import { interpolate, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, EASE_OUT, In, useCount } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { body, fitSize, Glow, headline, modeOf, Stage } from "../../ui";

const COUNT = 40;

/** A number that counts up big, with a ring of light that lands when it does. */
export default function BigNumber({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const value = str(v, "value");
  const shown = useCount(value, 1, COUNT);
  const size = fitSize(value, (shape === "wide" ? 300 : 270) * k, 6);
  const land = beat(1) + COUNT;
  const ring = interpolate(frame, [land - 4, land + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
  const icon = str(v, "icon");
  const dark = modeOf(theme) === "dark";
  return (
    <Stage shape={shape} k={k} gap={26}>
      <Glow color={accent} size={1000 * k} strength={0.28} style={{ left: "50%", top: "46%", translate: "-50% -50%" }} />
      <div style={{ position: "absolute", left: "50%", top: "46%", width: 700 * k, height: 700 * k, translate: "-50% -50%", borderRadius: "50%", border: `${3 * k}px solid ${accent}`, opacity: (1 - ring) * 0.8, scale: 0.6 + ring * 0.7 }} />
      {icon ? (
        <In step={0} role="icon">
          <div style={{ width: 120 * k, height: 120 * k, borderRadius: 36 * k, display: "grid", placeItems: "center", background: `${accent}26`, border: `${2 * k}px solid ${accent}55` }}>
            <Icon name={icon} size={64 * k} color={dark ? mix(accent, "#ffffff", 0.3) : mix(accent, "#000000", 0.25)} />
          </div>
        </In>
      ) : null}
      <In step={1} role="number">
        <div
          style={{
            ...headline(theme, size),
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            background: `linear-gradient(180deg, ${dark ? "#ffffff" : mix(accent, "#000000", 0.55)} 15%, ${dark ? mix(accent, "#ffffff", 0.2) : accent} 95%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: `drop-shadow(0 ${16 * k}px ${40 * k}px ${accent}44)`,
            paddingBottom: 10 * k,
          }}
        >
          {shown}
        </div>
      </In>
      <In step={3} role="text">
        <div style={{ ...headline(theme, (shape === "wide" ? 64 : 58) * k), maxWidth: 900 * k }}>{str(v, "label")}</div>
      </In>
      <In step={4} role="text">
        <p style={{ ...body(theme, 36 * k), maxWidth: 820 * k }}>{str(v, "sub")}</p>
      </In>
    </Stage>
  );
}

export const cues = (): Cue[] => [{ frame: beat(1) + COUNT - 2, sound: "pop" }];
