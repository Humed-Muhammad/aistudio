import { list, str } from "../../../elements/kit";
import { beat, In } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { appColors, modeOf, parts, ProductLayout, Surface, useTyped } from "../../ui";

const TYPE = 2;
/** When results start: after the query has been typed. */
const resultsAt = (query: string) => beat(TYPE) + Math.ceil(([...query].length / 20) * 30) + 8;

/** A search bar types the question; results fall into place, the first one highlighted. */
export default function Search({ v, theme, accent, shape, k }: SceneProps) {
  const app = appColors(modeOf(theme), accent);
  const W = (shape === "tall" ? 900 : shape === "wide" ? 900 : 560) * k;
  const u = W / 100;
  const query = str(v, "query");
  const typed = useTyped(query, beat(TYPE), 20);
  const results = list(v, "results").slice(0, 4);
  const start = resultsAt(query);
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={shape === "wide" ? 560 : undefined}>
      <div style={{ width: W, display: "flex", flexDirection: "column", gap: 2.6 * u, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif" }}>
        <In step={1} role="ui">
          <Surface app={app} k={k} radius={99} style={{ display: "flex", alignItems: "center", gap: 3 * u, padding: `${3.6 * u}px ${5 * u}px`, boxShadow: `${app.shadow}, 0 0 0 ${0.4 * u}px ${accent}66` }}>
            <Icon name="search" size={6 * u} color={accent} stroke={2.6} />
            <span style={{ fontSize: 5 * u, fontWeight: 600, color: app.text, whiteSpace: "nowrap", overflow: "hidden" }}>
              {typed.text}
              {typed.caret ? <i style={{ display: "inline-block", width: 0.4 * u, height: 5.4 * u, background: accent, marginLeft: 0.4 * u, verticalAlign: "middle" }} /> : null}
            </span>
          </Surface>
        </In>
        {results.map((r, i) => {
          const [icon, title, detail] = parts(r, 3);
          const best = i === 0;
          return (
            <In key={i} step={0} delay={start - 6 + i * 5} role="card">
              <Surface app={app} k={k} radius={44} style={{ display: "flex", alignItems: "center", gap: 3.4 * u, padding: `${3.2 * u}px ${4 * u}px`, boxShadow: best ? `0 0 0 ${0.4 * u}px ${accent}, 0 ${2 * u}px ${6 * u}px ${accent}33` : undefined }}>
                <div style={{ width: 10 * u, height: 10 * u, borderRadius: 3 * u, display: "grid", placeItems: "center", background: best ? accent : app.soft, flex: "none" }}>
                  <Icon name={icon || "file"} size={5.4 * u} color={best ? app.on : accent} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 4.4 * u, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                  <div style={{ fontSize: 3.6 * u, color: app.sub, fontWeight: 500, marginTop: 0.4 * u }}>{detail}</div>
                </div>
              </Surface>
            </In>
          );
        })}
      </div>
    </ProductLayout>
  );
}

export const cues = (v: Values): Cue[] => {
  const start = resultsAt(str(v, "query"));
  return list(v, "results").slice(0, 4).map((_, i) => ({ frame: start + i * 5 + 2, sound: "click" }));
};
