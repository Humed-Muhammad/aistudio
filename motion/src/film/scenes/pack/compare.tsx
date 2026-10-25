import { list, panel, str } from "../../../elements/kit";
import { onAccent } from "../../../colors";
import { beat, In, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, fitSize, headline, Stage } from "../../ui";

const LEFT0 = 2;
const RIGHT0 = 5;

/** The old way, dimmed with crosses, then your way lighting up with checks. */
export default function Compare({ v, theme, accent, shape, k }: SceneProps) {
  const title = str(v, "title");
  const left = list(v, "left").slice(0, 4);
  const right = list(v, "right").slice(0, 4);
  const wide = shape === "wide";
  const size = fitSize(title, (wide ? 100 : 88) * k, 22);
  const tall = shape === "tall";
  const text = (wide ? 42 : tall ? 42 : 34) * k;
  const column = (items: string[], good: boolean, head: string, step0: number) => (
    <In step={step0} role="card" style={{ flex: 1 }}>
      <div
        style={{
          ...panel(theme, k, 34),
          height: "100%",
          padding: `${34 * k}px ${30 * k}px`,
          textAlign: "left",
          opacity: good ? 1 : 0.72,
          ...(good ? { border: `${3 * k}px solid ${accent}`, boxShadow: `${theme.shadow}, 0 0 ${60 * k}px ${accent}44` } : {}),
        }}
      >
        <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: text * 0.9, letterSpacing: "0.06em", textTransform: "uppercase", color: good ? accent : theme.sub, marginBottom: 24 * k }}>{head}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 * k }}>
          {items.map((t, i) => (
            <In key={i} step={step0 + 0.8 + i * 0.9} role="text">
              <div style={{ display: "flex", alignItems: "center", gap: 18 * k }}>
                <span style={{ width: 52 * k, height: 52 * k, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: good ? accent : "rgba(128,128,128,.22)" }}>
                  <Icon name={good ? "check" : "x"} size={30 * k} color={good ? onAccent(accent) : theme.text} stroke={3} />
                </span>
                <span style={{ fontFamily: theme.body, fontWeight: 600, fontSize: text, color: theme.text, textDecoration: good ? undefined : "line-through", textDecorationColor: theme.sub, lineHeight: 1.2 }}>{t}</span>
              </div>
            </In>
          ))}
        </div>
      </div>
    </In>
  );
  return (
    <Stage shape={shape} k={k} gap={56}>
      <h2 style={{ ...headline(theme, size), maxWidth: 1100 * k }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 24 * k, width: (wide ? 1400 : 920) * k, alignItems: "stretch" }}>
        {column(left, false, str(v, "left_title"), LEFT0)}
        {column(right, true, str(v, "right_title"), RIGHT0)}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => [
  { frame: beat(RIGHT0) + 2, sound: "whoosh" },
  ...list(v, "right").slice(0, 4).map((_, i) => ({ frame: beat(RIGHT0 + 0.8 + i * 0.9) + 3, sound: "click" as const })),
];
