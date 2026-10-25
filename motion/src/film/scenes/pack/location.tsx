import { interpolate, useCurrentFrame } from "remotion";
import { str } from "../../../elements/kit";
import { mix, onAccent } from "../../../colors";
import { beat, EASE_OUT, In, useMotion } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps } from "../../types";
import { appColors, modeOf, ProductLayout, Surface } from "../../ui";

const DROP = 2;

/** A street map drawn in code; the pin drops and pulses, the place card slides up. */
export default function Location({ v, theme, accent, shape, k }: SceneProps) {
  const frame = useCurrentFrame();
  const app = appColors(modeOf(theme), accent);
  const dark = app.bg === "#0d0f14";
  const W = (shape === "tall" ? 900 : shape === "wide" ? 900 : 560) * k;
  const H = W * (shape === "tall" ? 1.05 : 0.8);
  const u = W / 100;
  const { travel } = useMotion(DROP, "card");
  const drop = useMotion(DROP, "icon").travel;
  const pulse = (frame - beat(DROP) - 16) / 40;
  const zoom = interpolate(frame, [0, 120], [1.12, 1], { extrapolateRight: "clamp", easing: EASE_OUT });
  const road = dark ? "#2b3040" : "#ffffff";
  const block = dark ? "#171a23" : "#e9ebf0";
  const water = dark ? mix(accent, "#0d0f14", 0.75) : mix(accent, "#ffffff", 0.75);
  const park = dark ? "#1a2a22" : "#d9efd9";
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={shape === "wide" ? 640 : undefined}>
      <In step={1} role="ui">
        <div style={{ position: "relative", width: W, height: H, borderRadius: 6 * u, overflow: "hidden", boxShadow: app.shadow, background: block }}>
          <svg viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", scale: zoom }}>
            <rect width="100" height="80" fill={block} />
            <path d="M -5 62 C 20 55, 35 70, 55 60 S 85 45, 105 52 L 105 80 L -5 80 Z" fill={water} />
            <rect x="8" y="8" width="18" height="14" rx="2" fill={park} />
            <rect x="70" y="14" width="16" height="12" rx="2" fill={park} />
            {[18, 38, 58].map((y) => (
              <rect key={y} x="-5" y={y} width="110" height="3.2" fill={road} />
            ))}
            {[14, 34, 52, 72, 90].map((x) => (
              <rect key={x} x={x} y="-5" width="3.2" height="90" fill={road} />
            ))}
            <path d="M -5 30 L 105 10" stroke={dark ? "#3a4154" : "#ffffff"} strokeWidth={5} />
            <path d="M -5 30 L 105 10" stroke={mix(accent, road, 0.5)} strokeWidth={0.6} strokeDasharray="2 2" />
          </svg>
          {/* Pulse rings and the pin at the place. */}
          <div style={{ position: "absolute", left: "52%", top: "44%" }}>
            {[0, 0.5].map((o) =>
              pulse > o ? (
                <i key={o} style={{ position: "absolute", left: -12 * u, top: -12 * u, width: 24 * u, height: 24 * u, borderRadius: "50%", background: `${accent}55`, opacity: 1 - ((pulse - o) % 1), scale: 0.2 + ((pulse - o) % 1) }} />
              ) : null,
            )}
            <div style={{ position: "absolute", left: -6 * u, top: -14 * u, translate: `0 ${(1 - Math.min(1, drop)) * -30 * u}px`, opacity: Math.min(1, drop * 3) }}>
              <svg width={12 * u} height={15 * u} viewBox="0 0 24 30" style={{ filter: `drop-shadow(0 ${1 * u}px ${1.6 * u}px rgba(0,0,0,.35))` }}>
                <path d="M12 29s10-9.5 10-17A10 10 0 0 0 2 12c0 7.5 10 17 10 17z" fill={accent} />
                <circle cx="12" cy="12" r="4" fill={onAccent(accent)} />
              </svg>
            </div>
          </div>
          <div style={{ position: "absolute", left: 4 * u, right: 4 * u, bottom: 4 * u, opacity: Math.min(1, travel), translate: `0 ${(1 - Math.min(1, travel)) * 14 * u}px` }}>
            <In step={DROP + 2} role="card">
              <Surface app={app} k={k} radius={40} style={{ display: "flex", alignItems: "center", gap: 3 * u, padding: `${3.4 * u}px ${4 * u}px`, boxShadow: app.shadow }}>
                <div style={{ width: 11 * u, height: 11 * u, flex: "none", borderRadius: 3.2 * u, display: "grid", placeItems: "center", background: accent }}>
                  <Icon name="pin" size={6 * u} color={onAccent(accent)} />
                </div>
                <div style={{ minWidth: 0, fontFamily: "Inter, 'Noto Sans Ethiopic', sans-serif" }}>
                  <div style={{ fontSize: 4.6 * u, fontWeight: 800 }}>{str(v, "name")}</div>
                  <div style={{ fontSize: 3.6 * u, color: app.sub, fontWeight: 500 }}>{str(v, "address")}</div>
                  <div style={{ fontSize: 3.4 * u, color: accent, fontWeight: 700, marginTop: 0.6 * u }}>{str(v, "hours")}</div>
                </div>
              </Surface>
            </In>
          </div>
        </div>
      </In>
    </ProductLayout>
  );
}

export const cues = (): Cue[] => [{ frame: beat(DROP) + 6, sound: "pop" }];
