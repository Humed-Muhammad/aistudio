import { interpolate, useCurrentFrame } from "remotion";
import { list, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, EASE_OUT, In, Words } from "../../motion";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, fitSize, headline, parts, Stage } from "../../ui";

const BAR0 = 2.5;
const EVERY = 1.2;

/** Bars rise one after another, counting their values; the highest is lit in the accent. */
export default function Bars({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const title = str(v, "title");
  const rows = list(v, "bars").slice(0, 7).map((r) => parts(r, 2)).map(([label, value]) => ({ label, value: Number(value.replace(/[^\d.-]/g, "")) || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  const top = rows.findIndex((r) => r.value === max);
  const wide = shape === "wide";
  const size = fitSize(title, (wide ? 100 : 92) * k, 22);
  const H = (shape === "tall" ? 760 : wide ? 560 : 480) * k;
  const W = (wide ? 1300 : 900) * k;
  const gap = 22 * k;
  const bw = (W - gap * (rows.length - 1)) / Math.max(1, rows.length);
  const ink = theme.ink ?? theme.text;
  return (
    <Stage shape={shape} k={k} gap={60}>
      <h2 style={{ ...headline(theme, size), maxWidth: 1100 * k }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ display: "flex", alignItems: "flex-end", gap, width: W, height: H + 120 * k }}>
        {rows.map((r, i) => {
          const at = beat(BAR0 + i * EVERY);
          const p = interpolate(frame, [at, at + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
          const hot = i === top;
          const h = Math.max(8 * k, (r.value / max) * H * p);
          const shown = (r.value * p).toFixed(Number.isInteger(r.value) ? 0 : 1);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * k }}>
              <div style={{ fontFamily: theme.body, fontWeight: 800, fontSize: Math.min(44, bw / 3.2) * k, color: hot ? accent : ink, opacity: p, fontVariantNumeric: "tabular-nums" }}>
                {str(v, "prefix")}
                {shown}
                {str(v, "unit")}
              </div>
              <div
                style={{
                  width: "100%",
                  height: h,
                  borderRadius: `${Math.min(24, bw / 4) * theme.radius}px ${Math.min(24, bw / 4) * theme.radius}px ${6 * k}px ${6 * k}px`,
                  background: hot ? `linear-gradient(180deg, ${mix(accent, "#ffffff", 0.25)}, ${accent})` : `linear-gradient(180deg, ${mix(accent, ink, 0.55)}66, ${mix(accent, ink, 0.55)}33)`,
                  boxShadow: hot ? `0 ${16 * k}px ${40 * k}px ${accent}55` : undefined,
                  border: hot ? undefined : `${2 * k}px solid ${mix(accent, ink, 0.55)}44`,
                }}
              />
              <In step={BAR0 + i * EVERY} role="fade">
                <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: 30 * k, color: theme.inkSub ?? theme.sub }}>{r.label}</div>
              </In>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => list(v, "bars").slice(0, 7).map((_, i) => ({ frame: beat(BAR0 + i * EVERY) + 2, sound: "click" }));
