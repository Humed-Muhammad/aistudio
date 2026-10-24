import { interpolate } from "remotion";
import { Starred, clamp, ease, onAccent, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function EndCard({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames, 12);
  const dim = interpolate(frame, [0, 12], [0, 1], clamp) * exit;
  const title = ease(frame, fps, 6, 16);
  const handle = ease(frame, fps, 14, 14);
  const cta = pop(frame, fps, 22, 11);
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: `radial-gradient(80% 60% at 50% 45%, rgba(10,12,18,.55), rgba(5,6,10,.88))`, backdropFilter: `blur(${10 * dim}px)`, opacity: dim }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 34 * k, width: 900 * k }}>
        <div style={{ opacity: title, transform: `translateY(${(1 - title) * 30 * k}px)` }}>
          <Starred text={str(v, "title")} theme={theme} accent={accent} size={110 * theme.type * k} color="#fff" />
        </div>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 54 * k, color: "rgba(255,255,255,.8)", opacity: handle }}>{str(v, "handle")}</div>
        <div style={{ padding: `${24 * k}px ${56 * k}px`, borderRadius: 999, background: accent, color: onAccent(accent), fontFamily: theme.head, fontWeight: 900, fontSize: 50 * k, transform: `scale(${cta})`, boxShadow: `0 ${14 * k}px ${40 * k}px ${accent}66`, whiteSpace: "nowrap" }}>{str(v, "cta")}</div>
      </div>
    </div>
  );
}
