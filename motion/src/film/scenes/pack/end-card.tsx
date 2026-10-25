import { useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { beat, In, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { accentWord, appColors, body, Button, fitSize, headline, Logo, modeOf, Stage } from "../../ui";

/** Brand mark, the ask, a breathing button and where to find you. Holds to the end of the film. */
export default function EndCard({ v, theme, accent, accent2, shape, k, brand }: SceneProps) {
  const frame = useCurrentFrame();
  const title = str(v, "title");
  const size = fitSize(title, (shape === "wide" ? 120 : 108) * k, 22);
  const app = appColors(modeOf(theme), accent);
  const words = title.split(/\s+/).length;
  const btnStep = 2 + words * 0.6 + 0.5;
  // After it lands the button breathes gently, inviting the tap.
  const pulse = frame > beat(btnStep) + 20 ? Math.sin((frame - beat(btnStep) - 20) / 9) * 0.03 : 0;
  return (
    <Stage shape={shape} k={k} gap={44}>
      <In step={0} role="icon">
        <div style={{ display: "flex", alignItems: "center", gap: 22 * k }}>
          <Logo brand={brand} size={110 * k} accent={accent} accent2={accent2} />
          {brand.logo ? null : <span style={{ ...headline(theme, 64 * k), textTransform: "none" }}>{brand.name}</span>}
        </div>
      </In>
      <h2 style={{ ...headline(theme, size), maxWidth: 1000 * k }}>
        <Words text={title} step={1.5} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <In step={btnStep} role="chip">
        <div style={{ scale: 1 + pulse }}>
          <Button label={str(v, "button")} app={app} k={k} size={44} />
        </div>
      </In>
      <In step={btnStep + 1.5} role="text">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * k }}>
          {str(v, "url") ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 * k, ...body(theme, 40 * k, theme.ink ?? theme.text), fontWeight: 700 }}>
              <Icon name="globe" size={36 * k} color={accent} />
              {str(v, "url")}
            </div>
          ) : null}
          <p style={{ ...body(theme, 28 * k) }}>{str(v, "note")}</p>
        </div>
      </In>
    </Stage>
  );
}

export const cues = (v: { [k: string]: unknown }): Cue[] => {
  const words = String(v.title ?? "").split(/\s+/).length;
  return [{ frame: beat(0) + 3, sound: "pop" }, { frame: beat(2 + words * 0.6 + 0.5) + 3, sound: "pop" }];
};
