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
        .padStart(2, "0")}, transparent 70%)`;
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
          filter: mesh ? undefined : `blur(${40 * k}px)`,
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
      {/* Vignette: the eye stays in the middle. */}
      <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, ${dark ? "rgba(0,0,0,.38)" : "rgba(40,40,60,.08)"} 100%)` }} />
    </AbsoluteFill>
  );
};
