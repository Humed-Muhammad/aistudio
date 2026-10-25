import { list, panel, str } from "../../../elements/kit";
import { beat, In, useMotion, Words } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, DrawCheck, fitSize, headline, Stage } from "../../ui";
import { onAccent } from "../../../colors";

const ITEM0 = 2.5;
const EVERY = 1.6;

const Row: React.FC<{ text: string; i: number; theme: SceneProps["theme"]; accent: string; k: number; size: number }> = ({ text, i, theme, accent, k, size }) => {
  const { enter } = useMotion(ITEM0 + i * EVERY + 0.6, "icon");
  return (
    <In step={ITEM0 + i * EVERY} role="card">
      <div style={{ ...panel(theme, k, 26), display: "flex", alignItems: "center", gap: 26 * k, padding: `${26 * k}px ${34 * k}px`, textAlign: "left" }}>
        <DrawCheck p={enter} size={size * 1.4} color={accent} on={onAccent(accent)} />
        <span style={{ fontFamily: theme.body, fontWeight: 700, fontSize: size, color: theme.text, lineHeight: 1.2 }}>{text}</span>
      </div>
    </In>
  );
};

/** Title, then benefits that land one by one, each ticking its own check. */
export default function Checklist({ v, theme, accent, shape, k }: SceneProps) {
  const title = str(v, "title");
  const items = list(v, "items").slice(0, 5);
  const size = fitSize(title, (shape === "wide" ? 100 : 92) * k, 22);
  const longest = Math.max(...items.map((t) => [...t].length), 10);
  const item = Math.min(46, 46 * (26 / longest) + 18) * k;
  return (
    <Stage shape={shape} k={k} row gap={shape === "wide" ? 90 : 56}>
      <h2 style={{ ...headline(theme, size), maxWidth: (shape === "wide" ? 700 : 900) * k, flex: "none" }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 * k, width: (shape === "wide" ? 820 : 880) * k }}>
        {items.map((t, i) => (
          <Row key={i} text={t} i={i} theme={theme} accent={accent} k={k} size={item} />
        ))}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => list(v, "items").slice(0, 5).map((_, i) => ({ frame: beat(ITEM0 + i * EVERY + 0.6) + 4, sound: "click" }));
