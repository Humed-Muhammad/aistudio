import { list, panel, str } from "../../../elements/kit";
import { mix, onAccent } from "../../../colors";
import { beat, In, useProgress } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { body, headline, parts, Stage } from "../../ui";

const STEP0 = 1.5;
const EVERY = 3;

/** Numbered steps; a line draws from each step to the next as it arrives. */
export default function Steps({ v, theme, accent, shape, k }: SceneProps) {
  const steps = list(v, "steps").slice(0, 4);
  const wide = shape === "wide";
  const n = steps.length;
  // The line runs from the first step to the last while they arrive.
  const line = useProgress(beat(STEP0) + 6, Math.max(1, (n - 1) * EVERY * 5));
  const dot = 92 * k;
  return (
    <Stage shape={shape} k={k} gap={60}>
      <In step={0} role="title">
        <div style={headline(theme, (wide ? 96 : 84) * k)}>{str(v, "title")}</div>
      </In>
      <div style={{ position: "relative", display: "flex", flexDirection: wide ? "row" : "column", gap: (wide ? 40 : 34) * k, width: wide ? 1500 * k : 880 * k }}>
        {/* The connecting line behind the numbers. */}
        <div
          style={{
            position: "absolute",
            background: `linear-gradient(${wide ? "90deg" : "180deg"}, ${accent}, ${mix(accent, "#ffffff", 0.4)})`,
            borderRadius: 4 * k,
            ...(wide
              ? { left: `${100 / n / 2}%`, top: dot / 2 + 30 * k - 3 * k, height: 6 * k, width: `${(100 - 100 / n) * line}%` }
              : { left: 30 * k + dot / 2 - 3 * k, top: dot / 2 + 30 * k, width: 6 * k, height: `calc(${line} * (100% - ${dot + 60 * k}px))` }),
          }}
        />
        {steps.map((row, i) => {
          const [icon, title, text] = parts(row, 3);
          return (
            <In key={i} step={STEP0 + i * EVERY} role="card" style={{ flex: 1 }}>
              <div style={{ ...panel(theme, k, 30), display: "flex", flexDirection: wide ? "column" : "row", alignItems: wide ? "center" : "flex-start", textAlign: wide ? "center" : "left", gap: 26 * k, padding: 30 * k, height: "100%" }}>
                <div style={{ width: dot, height: dot, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: `linear-gradient(145deg, ${mix(accent, "#ffffff", 0.2)}, ${accent})`, boxShadow: `0 ${12 * k}px ${30 * k}px ${accent}55`, position: "relative" }}>
                  <Icon name={icon || "check"} size={44 * k} color={onAccent(accent)} />
                  <span style={{ position: "absolute", right: -8 * k, top: -8 * k, width: 40 * k, height: 40 * k, borderRadius: "50%", display: "grid", placeItems: "center", background: theme.text, color: onAccent(theme.text), fontFamily: theme.body, fontWeight: 800, fontSize: 22 * k }}>{i + 1}</span>
                </div>
                <div>
                  <div style={{ ...headline(theme, 48 * k, theme.text), textTransform: "none" }}>{title}</div>
                  <p style={{ ...body(theme, 32 * k, theme.sub), marginTop: 8 * k }}>{text}</p>
                </div>
              </div>
            </In>
          );
        })}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => list(v, "steps").slice(0, 4).map((_, i) => ({ frame: beat(STEP0 + i * EVERY) + 4, sound: "click" }));
