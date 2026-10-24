import { interpolate } from "remotion";
import { clamp, ease, fit, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function WebsiteBar({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 14);
  const url = str(v, "url");
  const n = Math.round(interpolate(frame, [8, 30], [0, url.length], clamp));
  return (
    <div style={{ width: 880 * k, display: "flex", alignItems: "center", gap: 18 * k, padding: `${20 * k}px ${30 * k}px`, borderRadius: 999, background: "rgba(245,246,250,.92)", boxShadow: `0 ${16 * k}px ${40 * k}px rgba(0,0,0,.3)`, opacity: exit * box, transform: `scaleX(${0.6 + 0.4 * box})` }}>
      <svg width={36 * k} height={40 * k} viewBox="0 0 18 20"><rect x="2" y="8" width="14" height="11" rx="2.5" fill={accent} /><path d="M5 8V5.5a4 4 0 0 1 8 0V8" fill="none" stroke={accent} strokeWidth="2.2" /></svg>
      <div style={{ flex: 1, fontFamily: theme.body, fontWeight: 600, fontSize: fit(url, 44 * k, 28), color: "#16181f", whiteSpace: "nowrap", overflow: "hidden" }}>
        {url.slice(0, n)}
        <span style={{ display: "inline-block", width: 3 * k, height: 40 * k, background: accent, verticalAlign: "-0.15em", opacity: n < url.length || Math.floor(frame / 8) % 2 ? 1 : 0 }} />
      </div>
    </div>
  );
}
