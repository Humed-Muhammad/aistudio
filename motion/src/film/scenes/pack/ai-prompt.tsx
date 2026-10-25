import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, In } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { appColors, Button, modeOf, parts, ProductLayout, Surface, useTyped } from "../../ui";

const TYPE = 2;
const CPS = 34;
const press = (prompt: string) => beat(TYPE) + Math.ceil(([...prompt].length / CPS) * 30) + 10;

/** A prompt types, Generate is pressed (sparkles), results shimmer in as skeletons and fill with text. */
export default function AiPrompt({ v, theme, accent, accent2, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const app = appColors(modeOf(theme), accent);
  const W = (shape === "tall" ? 900 : shape === "wide" ? 940 : 600) * k;
  const u = W / 100;
  const prompt = str(v, "prompt");
  const typed = useTyped(prompt, beat(TYPE), CPS);
  const at = press(prompt);
  const results = list(v, "results").slice(0, 3);
  const pressed = interpolate(frame, [at - 2, at + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={shape === "wide" ? 520 : undefined}>
      <div style={{ width: W, display: "flex", flexDirection: "column", gap: 3 * u, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif" }}>
        <In step={1} role="ui">
          <div style={{ position: "relative", borderRadius: 5 * u, padding: 0.5 * u, background: `linear-gradient(${frame * 3}deg, ${accent}, ${accent2}, ${mix(accent, "#ffffff", 0.4)})`, boxShadow: `0 ${3 * u}px ${10 * u}px ${accent}44` }}>
            <Surface app={app} k={k} radius={48} style={{ padding: `${4.4 * u}px ${4.8 * u}px`, boxShadow: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2 * u, color: accent, fontSize: 3.4 * u, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <Icon name="sparkles" size={4.6 * u} color={accent} />
                Ask
              </div>
              <div style={{ fontSize: 4.8 * u, fontWeight: 600, lineHeight: 1.35, minHeight: 13 * u, marginTop: 2 * u, color: app.text }}>
                {typed.text}
                {typed.caret && !typed.done ? <i style={{ display: "inline-block", width: 0.4 * u, height: 5 * u, background: accent, marginLeft: 0.4 * u, verticalAlign: "middle" }} /> : null}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 * u }}>
                <Button label={str(v, "button")} app={app} k={u / 6} size={28} pressed={pressed} />
              </div>
            </Surface>
          </div>
        </In>
        {results.map((r, i) => {
          const [title, text] = parts(r, 2);
          const appear = at + 8 + i * 6;
          const fill = interpolate(frame, [appear + 14, appear + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const shimmer = ((frame - appear) * 4) % 200;
          return (
            <In key={i} step={0} delay={appear - 6} role="card">
              <Surface app={app} k={k} radius={40} style={{ padding: `${3.4 * u}px ${4 * u}px`, position: "relative", overflow: "hidden" }}>
                <div style={{ opacity: fill }}>
                  <div style={{ fontSize: 3.4 * u, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
                  <div style={{ fontSize: 4 * u, fontWeight: 500, color: app.text, marginTop: 1 * u, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
                </div>
                {fill < 1 ? (
                  <div style={{ position: "absolute", inset: `${3.4 * u}px ${4 * u}px`, opacity: 1 - fill }}>
                    {[30, 85].map((w, n) => (
                      <i key={n} style={{ display: "block", width: `${w}%`, height: 3.2 * u, borderRadius: 2 * u, marginBottom: 1.6 * u, background: `linear-gradient(90deg, ${app.surface2} ${shimmer - 60}%, ${mix(accent, app.surface2, 0.7)} ${shimmer - 30}%, ${app.surface2} ${shimmer}%)` }} />
                    ))}
                  </div>
                ) : null}
              </Surface>
            </In>
          );
        })}
      </div>
    </ProductLayout>
  );
}

export const cues = (v: Values): Cue[] => {
  const at = press(str(v, "prompt"));
  return [{ frame: at, sound: "click" }, { frame: at + 6, sound: "whoosh" }, { frame: at + 34, sound: "success" }];
};
