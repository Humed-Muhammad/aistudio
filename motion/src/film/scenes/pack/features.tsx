import { list, panel, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, In, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, fitSize, headline, modeOf, parts, Stage } from "../../ui";

const TILE0 = 2;
const EVERY = 0.9;

/** Feature tiles in a grid, each popping in with its icon. */
export default function Features({ v, theme, accent, shape, k }: SceneProps) {
  const title = str(v, "title");
  const items = list(v, "items").slice(0, 6);
  const wide = shape === "wide";
  const cols = wide ? 3 : 2;
  const size = fitSize(title, (wide ? 100 : 92) * k, 22);
  const dark = modeOf(theme) === "dark";
  return (
    <Stage shape={shape} k={k} gap={56}>
      <h2 style={{ ...headline(theme, size), maxWidth: 1100 * k }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 24 * k, width: (wide ? 1400 : 900) * k }}>
        {items.map((row, i) => {
          const [icon, label] = parts(row, 2);
          return (
            <In key={i} step={TILE0 + i * EVERY} role="card">
              <div style={{ ...panel(theme, k, 30), display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 22 * k, padding: `${32 * k}px ${30 * k}px`, height: "100%", textAlign: "left" }}>
                <div style={{ width: 84 * k, height: 84 * k, borderRadius: 24 * k * theme.radius, display: "grid", placeItems: "center", background: `${accent}${dark ? "2e" : "22"}`, border: `${2 * k}px solid ${accent}55` }}>
                  <Icon name={icon || "check"} size={44 * k} color={dark ? mix(accent, "#ffffff", 0.3) : mix(accent, "#000000", 0.2)} />
                </div>
                <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 38 * k, lineHeight: 1.18, color: theme.text }}>{label}</div>
              </div>
            </In>
          );
        })}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => list(v, "items").slice(0, 6).map((_, i) => ({ frame: beat(TILE0 + i * EVERY) + 3, sound: "pop" }));
