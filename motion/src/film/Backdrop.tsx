import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { mix } from "../colors";
import type { Kit } from "../graphicKits";
import { useSvgId } from "../elements/kit";
import type { BackdropName } from "./types";

// The film's backdrop: one continuous layer under every scene, so cuts never flash to a new background.
// Everything moves slowly and deterministically (from the frame number only).

/** Base colour of the backdrop: near black or near white, tinted a little by the accent. */
export const baseColor = (mode: "dark" | "light", accent: string) => (mode === "dark" ? mix("#07080c", accent, 0.07) : mix("#f6f6f4", accent, 0.05));

export const Backdrop: React.FC<{
  name: BackdropName;
  kit: Kit;
  mode: "dark" | "light";
  accent: string;
  accent2: string;
  /** Camera offset in px (world camera): the backdrop moves a little with it for depth. */
  shift?: { x: number; y: number };
}> = ({ name, kit, mode, accent, accent2, shift = { x: 0, y: 0 } }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const k = Math.min(width, height) / 1080;
  const dark = mode === "dark";
  const base = baseColor(mode, accent);
  const t = frame / fps;
  const grain = useSvgId("grain");
  // Light strength of colour glows: richer on dark, gentle on light.
  const glow = dark ? 0.7 : 0.4;
  const px = shift.x * 0.12;
  const py = shift.y * 0.12;

  let layer: React.ReactNode = null;
  if (name === "plain") layer = <AbsoluteFill style={{ background: kit.scene[mode] }} />;
  else if (name === "aurora" || name === "mesh") {
    // Big soft colour fields drifting on slow circles; mesh keeps them sharper and nearer the corners.
    const blob = (c: string, x: number, y: number, r: number, speed: number, phase: number, alpha: number) => {
      const bx = x + Math.cos(t * speed + phase) * 9;
      const by = y + Math.sin(t * speed * 0.8 + phase) * 7;
      return `radial-gradient(${r}% ${r * 0.8}% at ${bx}% ${by}%, ${c}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}, ${c}00 78%)`;
    };
    const mesh = name === "mesh";
    layer = (
      <AbsoluteFill
        style={{
          background: [
            blob(accent, mesh ? 12 : 22, mesh ? 10 : 18, mesh ? 60 : 70, 0.22, 0, glow),
            blob(accent2, mesh ? 90 : 80, mesh ? 88 : 82, mesh ? 62 : 72, 0.18, 2, glow * 0.9),
            blob(mix(accent, accent2, 0.5), mesh ? 85 : 70, mesh ? 15 : 30, mesh ? 45 : 50, 0.26, 4, glow * 0.6),
            blob(dark ? "#ffffff" : accent, 30, 85, 40, 0.15, 1, dark ? 0.05 : 0.12),
          ].join(", "),
          scale: mesh ? 1 : 1.15,
          translate: `${px}px ${py}px`,
        }}
      />
    );
  } else if (name === "grid" || name === "dots") {
    const cell = (name === "grid" ? 72 : 44) * k;
    const line = dark ? "rgba(255,255,255,.07)" : "rgba(10,12,20,.07)";
    const pan = (t * 6 * k) % cell;
    layer = (
      <>
        <AbsoluteFill
          style={{
            backgroundImage:
              name === "grid"
                ? `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
                : `radial-gradient(${dark ? "rgba(255,255,255,.16)" : "rgba(10,12,20,.16)"} ${1.6 * k}px, transparent ${2 * k}px)`,
            backgroundSize: `${cell}px ${cell}px`,
            backgroundPosition: `${px - pan}px ${py - pan}px`,
            maskImage: "radial-gradient(75% 65% at 50% 45%, #000 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(75% 65% at 50% 45%, #000 30%, transparent 100%)",
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(55% 40% at ${50 + Math.sin(t * 0.3) * 8}% 30%, ${accent}${dark ? "33" : "22"}, transparent 70%), radial-gradient(45% 35% at 70% 85%, ${accent2}${dark ? "26" : "18"}, transparent 70%)`,
          }}
        />
      </>
    );
  } else if (name === "spotlight") {
    const sway = Math.sin(t * 0.4) * 6;
    layer = (
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(60% 45% at ${50 + sway}% 18%, ${dark ? mix(accent, "#ffffff", 0.6) + "33" : "#ffffffcc"}, transparent 70%)`,
            `radial-gradient(90% 60% at 50% 110%, ${accent}${dark ? "30" : "1c"}, transparent 70%)`,
          ].join(", "),
        }}
      />
    );
  } else if (name === "rays") {
    const turn = interpolate(frame, [0, 30 * fps], [0, 40]);
    layer = (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            width: Math.max(width, height) * 2,
            height: Math.max(width, height) * 2,
            translate: "-50% -50%",
            rotate: `${turn}deg`,
            background: `repeating-conic-gradient(from 0deg, ${accent}${dark ? "1c" : "14"} 0deg 6deg, transparent 6deg 18deg)`,
            maskImage: "radial-gradient(closest-side, #000 10%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(closest-side, #000 10%, transparent 75%)",
          }}
        />
        <AbsoluteFill style={{ background: `radial-gradient(40% 30% at 50% 40%, ${accent2}${dark ? "40" : "22"}, transparent 70%)` }} />
      </AbsoluteFill>
    );
  } else if (name === "cartoon") {
    // Flat cartoon world: pastel sky, two low rolling hills and a few clouds drifting slowly. No blur, no glow.
    // Hills stay under ~80% and clouds in the top strip, so they never run behind scene text or icons.
    const sky = dark ? mix("#2b2d42", accent2, 0.25) : mix("#ffffff", accent2, 0.22);
    const far = dark ? mix("#2b2d42", accent, 0.35) : mix("#ffffff", accent, 0.32);
    const near = dark ? mix("#2b2d42", accent2, 0.45) : mix("#ffffff", accent2, 0.5);
    const drift = (speed: number, phase: number) => ((t * speed + phase) % 130) - 15;
    const cloud = (x: number, y: number, s: number, key: number) => (
      <div key={key} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 220 * s * k, height: 64 * s * k, borderRadius: 999, background: dark ? "rgba(255,255,255,.14)" : "#ffffff" }}>
        <div style={{ position: "absolute", left: "18%", bottom: "40%", width: 96 * s * k, height: 96 * s * k, borderRadius: "50%", background: "inherit" }} />
        <div style={{ position: "absolute", left: "44%", bottom: "30%", width: 128 * s * k, height: 128 * s * k, borderRadius: "50%", background: "inherit" }} />
      </div>
    );
    layer = (
      <AbsoluteFill style={{ background: sky }}>
        {[cloud(drift(0.9, 10), 7, 0.85, 1), cloud(drift(0.6, 70), 13, 0.6, 2), cloud(drift(0.75, 120), 4, 0.5, 3)]}
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }} preserveAspectRatio="none">
          <path d={`M0 ${height * 0.87} C ${width * 0.25} ${height * 0.8}, ${width * 0.45} ${height * 0.82}, ${width * 0.62} ${height * 0.88} S ${width * 0.9} ${height * 0.82}, ${width} ${height * 0.85} L ${width} ${height} L 0 ${height} Z`} fill={far} />
          <path d={`M0 ${height * 0.93} C ${width * 0.2} ${height * 0.89}, ${width * 0.5} ${height * 0.91}, ${width * 0.7} ${height * 0.94} S ${width * 0.92} ${height * 0.92}, ${width} ${height * 0.91} L ${width} ${height} L 0 ${height} Z`} fill={near} />
        </svg>
      </AbsoluteFill>
    );
  } else if (name === "paper") {
    layer = (
      <AbsoluteFill
        style={{
          background: `radial-gradient(80% 60% at 30% 20%, ${mix(accent, "#ffffff", 0.85)}66, transparent 70%), radial-gradient(70% 50% at 80% 90%, ${mix(accent2, "#ffffff", 0.85)}55, transparent 70%)`,
        }}
      />
    );
  }

  return (
    <AbsoluteFill style={{ background: name === "paper" ? (dark ? "#16140f" : "#f3efe6") : base, overflow: "hidden" }}>
      {layer}
      {/* Fine grain so gradients never band and flat colour feels printed, not digital. */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: dark ? 0.09 : 0.06, mixBlendMode: dark ? "screen" : "multiply" }}>
        <filter id={grain}>
          <feTurbulence type="fractalNoise" baseFrequency={0.9 / k} numOctaves={2} seed={3} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grain})`} />
      </svg>
      {/* Vignette: the eye stays in the middle (not on flat cartoon colour). */}
      <AbsoluteFill hidden={name === "cartoon"} style={{ background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, ${dark ? "rgba(0,0,0,.38)" : "rgba(40,40,60,.08)"} 100%)` }} />
    </AbsoluteFill>
  );
};
