import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { onAccent } from "../../../colors";
import { beat, EASE_IN_OUT, In } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { body, headline, Stage } from "../../ui";

const FIRST = 2;
/** Frames each word stays before the next rolls in, given the scene length. */
const holdFor = (n: number, frames: number) => Math.max(14, Math.floor((frames - beat(FIRST) - 22) / Math.max(1, n)));

/** A fixed lead line and a word in an accent pill that rolls to the next one. */
export default function WordSwap({ v, theme, accent, shape, k, durationInFrames }: SceneProps) {
  const frame = useCurrentFrame();
  const words = list(v, "words");
  const size = (shape === "wide" ? 120 : shape === "tall" ? 108 : 96) * k;
  const hold = holdFor(words.length, durationInFrames);
  const t = frame - beat(FIRST);
  const i = Math.max(0, Math.min(words.length - 1, Math.floor(t / hold)));
  const roll = interpolate(t - i * hold, [hold - 10, hold], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT });
  const rolling = i < words.length - 1 ? roll : 0;
  // The pill eases between the widths of the two words (estimated from their length).
  const est = (w = "") => [...w].length * size * 0.56 + size * 0.7;
  const width = est(words[i]) + (est(words[i + 1]) - est(words[i])) * rolling;
  const h = size * 1.3;
  return (
    <Stage shape={shape} k={k} gap={36}>
      <In step={0} role="title">
        <div style={headline(theme, size)}>{str(v, "lead")}</div>
      </In>
      <In step={1} role="chip">
        <div style={{ width, height: h, borderRadius: Math.min(h / 2, 40 * theme.radius * k), background: accent, overflow: "hidden", position: "relative", boxShadow: `0 ${20 * k}px ${50 * k}px ${accent}55` }}>
          {[words[i], words[i + 1]].map((w, n) =>
            w === undefined ? null : (
              <div
                key={n}
                style={{
                  ...headline(theme, size, onAccent(accent)),
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  whiteSpace: "nowrap",
                  translate: `0 ${(n - rolling) * h}px`,
                  filter: `blur(${Math.sin(rolling * Math.PI) * 6 * k}px)`,
                }}
              >
                {w}
              </div>
            ),
          )}
        </div>
      </In>
      <In step={3} role="text">
        <p style={{ ...body(theme, 38 * k), maxWidth: 820 * k, marginTop: 12 * k }}>{str(v, "sub")}</p>
      </In>
    </Stage>
  );
}

export const cues = (v: Values, frames: number): Cue[] => {
  const n = list(v, "words").length;
  const hold = holdFor(n, frames);
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ frame: beat(FIRST) + (i + 1) * hold - 6, sound: "click" as const }));
};
