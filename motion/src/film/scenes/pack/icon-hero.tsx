import { interpolate, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { mix, onAccent } from "../../../colors";
import { beat, In, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { accentWord, body, fitSize, Glow, headline, Stage } from "../../ui";

/** A glossy tile with depth, turning slowly, over the headline. */
export default function IconHero({ v, theme, accent, accent2, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const title = str(v, "title");
  const size = fitSize(title, (shape === "wide" ? 116 : 104) * k, 22);
  const tile = (shape === "tall" ? 300 : 260) * k;
  const turn = interpolate(frame, [0, 120], [-18, 10]);
  const float = Math.sin(frame / 22) * 10 * k;
  return (
    <Stage shape={shape} k={k} row gap={shape === "wide" ? 110 : 60}>
      <div style={{ position: "relative", perspective: 1400 * k, flex: "none" }}>
        <Glow color={accent} size={tile * 2.6} strength={0.4} style={{ left: "50%", top: "50%", translate: "-50% -50%" }} />
        <In step={0} role="icon">
          <div
            style={{
              width: tile,
              height: tile,
              borderRadius: tile * 0.28,
              display: "grid",
              placeItems: "center",
              transform: `translateY(${float}px) rotateY(${turn}deg) rotateX(8deg)`,
              background: `linear-gradient(150deg, ${mix(accent, "#ffffff", 0.35)} 0%, ${accent} 45%, ${mix(accent2, accent, 0.4)} 100%)`,
              boxShadow: `0 ${tile * 0.25}px ${tile * 0.45}px ${accent}66, inset 0 ${tile * 0.03}px 0 rgba(255,255,255,.55), inset 0 ${-tile * 0.05}px ${tile * 0.08}px rgba(0,0,0,.18)`,
            }}
          >
            <Icon name={str(v, "icon")} size={tile * 0.5} color={onAccent(accent)} stroke={2.2} />
          </div>
        </In>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 * k, alignItems: shape === "wide" ? "flex-start" : "center" }}>
        <h2 style={{ ...headline(theme, size), maxWidth: 900 * k }}>
          <Words text={title} step={1.5} accentStyle={accentWord(theme, accent, size)} />
        </h2>
        <In step={1.5 + title.split(/\s+/).length * 0.6 + 1} role="text">
          <p style={{ ...body(theme, 38 * k), maxWidth: 820 * k }}>{str(v, "sub")}</p>
        </In>
      </div>
    </Stage>
  );
}

export const cues = (): Cue[] => [{ frame: beat(0) + 3, sound: "pop" }];
