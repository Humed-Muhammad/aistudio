import { list, panel, str } from "../../../elements/kit";
import { beat, In, useCount, Words } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, body, fitSize, headline, parts, Stage } from "../../ui";

const STAT0 = 2;
const EVERY = 1.4;

const Stat: React.FC<{ row: string; i: number; props: SceneProps; tall: boolean }> = ({ row, i, props, tall }) => {
  const { theme, accent, k } = props;
  const [value, label] = parts(row, 2);
  const shown = useCount(value, STAT0 + i * EVERY, 34);
  return (
    <In step={STAT0 + i * EVERY} role="card" style={{ flex: 1 }}>
      <div style={{ ...panel(theme, k, 34), padding: `${(tall ? 34 : 44) * k}px ${36 * k}px`, height: "100%", display: "flex", flexDirection: tall ? "row" : "column", alignItems: tall ? "center" : "flex-start", gap: (tall ? 30 : 10) * k, textAlign: "left" }}>
        <div style={{ ...headline(theme, (tall ? 104 : 96) * k, accent), letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", minWidth: tall ? 340 * k : undefined }}>{shown}</div>
        <div style={{ ...body(theme, 36 * k, theme.text), fontWeight: 600 }}>{label}</div>
      </div>
    </In>
  );
};

/** Numbers that count up together, each on its own card. */
export default function Stats(props: SceneProps) {
  const { v, theme, accent, shape, k } = props;
  const title = str(v, "title");
  const rows = list(v, "stats").slice(0, 4);
  const tall = shape === "tall";
  const size = fitSize(title, (shape === "wide" ? 100 : 90) * k, 22);
  return (
    <Stage shape={shape} k={k} gap={56}>
      <h2 style={{ ...headline(theme, size), maxWidth: 1100 * k }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 24 * k, width: (shape === "wide" ? 1450 : 920) * k, alignItems: "stretch" }}>
        {rows.map((r, i) => (
          <Stat key={i} row={r} i={i} props={props} tall={tall} />
        ))}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => list(v, "stats").slice(0, 4).map((_, i) => ({ frame: beat(STAT0 + i * EVERY) + 3, sound: "click" }));
