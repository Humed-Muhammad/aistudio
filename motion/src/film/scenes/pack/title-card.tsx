import { str } from "../../../elements/kit";
import { beat, In, useProgress, Words } from "../../motion";
import type { SceneProps } from "../../types";
import { accentWord, body, fitSize, headline, Stage } from "../../ui";

/** Chapter break: outlined number, title word by word, and an accent line that draws under it. */
export default function TitleCard({ v, theme, accent, shape, k }: SceneProps) {
  const title = str(v, "title");
  const size = fitSize(title, (shape === "wide" ? 130 : 112) * k, 20);
  const line = useProgress(beat(2), 24);
  return (
    <Stage shape={shape} k={k} gap={20}>
      <In step={0} role="number">
        <div style={{ ...headline(theme, 260 * k), lineHeight: 0.9, color: "transparent", WebkitTextStroke: `${3 * k}px ${accent}`, opacity: 0.9 }}>{str(v, "number")}</div>
      </In>
      <In step={1} role="fade">
        <p style={{ ...body(theme, 32 * k), textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 700 }}>{str(v, "sub")}</p>
      </In>
      <h2 style={{ ...headline(theme, size), maxWidth: 1100 * k }}>
        <Words text={title} step={1.5} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ width: 260 * k * line, height: 8 * k, borderRadius: 8 * k, background: accent, marginTop: 14 * k }} />
    </Stage>
  );
}
