import { num, panel, str } from "../../../elements/kit";
import { beat, In, useMotion, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { accentWord, Avatar, body, fitSize, headline, Stage } from "../../ui";

const Star: React.FC<{ i: number; on: boolean; accent: string; k: number }> = ({ i, on, accent, k }) => {
  const { travel } = useMotion(1 + i * 0.4, "icon");
  return (
    <span style={{ scale: travel, display: "inline-block" }}>
      <Icon name="star" size={58 * k} color={on ? accent : "rgba(128,128,128,.5)"} style={{ fill: on ? accent : "none" }} />
    </span>
  );
};

/** A review card: stars pop, the quote builds, the person signs it. */
export default function Quote({ v, theme, accent, shape, k }: SceneProps) {
  const quote = str(v, "quote");
  const size = fitSize(quote, (shape === "wide" ? 80 : 72) * k, shape === "wide" ? 70 : 64);
  const stars = Math.round(num(v, "stars"));
  return (
    <Stage shape={shape} k={k}>
      <In step={0} role="card">
        <div style={{ ...panel(theme, k, 44), padding: `${64 * k}px ${60 * k}px`, maxWidth: (shape === "wide" ? 1300 : 920) * k, textAlign: "left", position: "relative" }}>
          <div style={{ position: "absolute", top: -60 * k, left: 46 * k, fontFamily: "Georgia, serif", fontSize: 260 * k, lineHeight: 1, color: accent, opacity: 0.9 }}>“</div>
          {stars > 0 ? (
            <div style={{ display: "flex", gap: 8 * k, marginBottom: 34 * k }}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} i={i} on={i < stars} accent={accent} k={k} />
              ))}
            </div>
          ) : null}
          <p style={{ ...headline(theme, size, theme.text), fontWeight: Math.min(700, theme.headWeight), textTransform: "none", lineHeight: 1.22 }}>
            <Words text={quote} step={2.5} every={2} accentStyle={accentWord(theme, accent, size)} />
          </p>
          <In step={2.5 + quote.split(/\s+/).length * 0.4 + 1} role="text">
            <div style={{ display: "flex", alignItems: "center", gap: 22 * k, marginTop: 44 * k }}>
              <Avatar name={str(v, "name")} size={86 * k} accent={accent} />
              <div>
                <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: 36 * k, color: theme.text }}>{str(v, "name")}</div>
                <div style={{ ...body(theme, 28 * k, theme.sub) }}>{str(v, "role")}</div>
              </div>
            </div>
          </In>
        </div>
      </In>
    </Stage>
  );
}

export const cues = (): Cue[] => [{ frame: beat(1) + 4, sound: "pop" }];
