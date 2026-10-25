import { str } from "../../../elements/kit";
import { beat, In, Words } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, body, fitSize, Glow, headline, Kicker, Stage } from "../../ui";

/** The opening line: label, headline word by word, then the line under it. */
export default function Hook({ v, theme, accent, shape, k }: SceneProps) {
  const title = str(v, "title");
  const size = fitSize(title, (shape === "tall" ? 124 : shape === "wide" ? 128 : 108) * k, shape === "wide" ? 34 : 24);
  const words = title.split(/\s+/).length;
  return (
    <Stage shape={shape} k={k} gap={44}>
      <Glow color={accent} size={900 * k} strength={0.22} style={{ left: "50%", top: "45%", translate: "-50% -50%" }} />
      <In step={0} role="chip">
        <Kicker text={str(v, "kicker")} theme={theme} accent={accent} k={k} />
      </In>
      <h1 style={{ ...headline(theme, size), maxWidth: (shape === "wide" ? 1500 : 920) * k, position: "relative" }}>
        <Words text={title} step={1} every={3} accentStyle={accentWord(theme, accent, size)} />
      </h1>
      <In step={1 + words * 0.6 + 1} role="text">
        <p style={{ ...body(theme, (shape === "tall" ? 40 : 38) * k), maxWidth: 860 * k }}>{str(v, "sub")}</p>
      </In>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => (str(v, "kicker") ? [{ frame: beat(0) + 2, sound: "pop" }] : []);
