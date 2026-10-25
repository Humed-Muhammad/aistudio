import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { beat, EASE_OUT, In } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { appColors, Avatar, modeOf, parts, Phone, ProductLayout } from "../../ui";

const FIRST = 2.5;
const TYPING = 14;

/** When each message lands: replies wait for a short typing indicator. */
const times = (rows: string[]) => {
  let at = beat(FIRST);
  return rows.map((r) => {
    const them = parts(r, 2)[0].toLowerCase() !== "me";
    if (them) at += TYPING;
    const t = at;
    at += 16 + Math.min(14, parts(r, 2)[1].length / 3);
    return { at: t, them };
  });
};

/** A conversation: bubbles rise in, replies are preceded by three typing dots. */
export default function Chat({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const rows = list(v, "messages").slice(0, 6);
  const app = appColors(modeOf(theme), accent);
  const W = (shape === "tall" ? 560 : shape === "wide" ? 440 : 390) * k;
  const u = W / 100;
  const t = times(rows);
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")}>
      <In step={1} role="ui">
        <Phone width={W} k={k} app={app}>
          <div style={{ display: "flex", alignItems: "center", gap: 3 * u, padding: `${1 * u}px ${5 * u}px ${3.5 * u}px`, borderBottom: `${0.3 * u}px solid ${app.line}` }}>
            <Avatar name={str(v, "contact")} size={10 * u} accent={accent} />
            <div>
              <div style={{ fontSize: 4.8 * u, fontWeight: 800 }}>{str(v, "contact")}</div>
              <div style={{ fontSize: 3.6 * u, color: accent, fontWeight: 600 }}>online</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u, padding: `${5 * u}px ${4.5 * u}px` }}>
            {rows.map((r, i) => {
              const [, text] = parts(r, 2);
              const { at, them } = t[i];
              const p = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
              const typing = them && frame >= at - TYPING && frame < at;
              if (p <= 0 && !typing) return null;
              const bubble: React.CSSProperties = {
                alignSelf: them ? "flex-start" : "flex-end",
                maxWidth: "78%",
                padding: `${2.8 * u}px ${4 * u}px`,
                borderRadius: 5 * u,
                ...(them ? { borderBottomLeftRadius: 1.2 * u } : { borderBottomRightRadius: 1.2 * u }),
                background: them ? app.surface2 : `linear-gradient(160deg, ${accent}, ${accent}dd)`,
                color: them ? app.text : app.on,
                fontSize: 4.6 * u,
                fontWeight: 500,
                lineHeight: 1.3,
              };
              if (typing)
                return (
                  <div key={i} style={{ ...bubble, display: "flex", gap: 1.4 * u, padding: `${3.4 * u}px ${4 * u}px` }}>
                    {[0, 1, 2].map((d) => (
                      <i key={d} style={{ width: 2 * u, height: 2 * u, borderRadius: "50%", background: app.sub, opacity: 0.4 + 0.6 * Math.max(0, Math.sin((frame - d * 4) / 4)) }} />
                    ))}
                  </div>
                );
              return (
                <div key={i} style={{ ...bubble, opacity: p, translate: `0 ${(1 - p) * 6 * u}px`, scale: 0.92 + 0.08 * p, transformOrigin: them ? "left bottom" : "right bottom" }}>
                  {text}
                </div>
              );
            })}
          </div>
        </Phone>
      </In>
    </ProductLayout>
  );
}

export const cues = (v: Values): Cue[] => times(list(v, "messages").slice(0, 6)).map(({ at }) => ({ frame: at + 1, sound: "pop" }));
