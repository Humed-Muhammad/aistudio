import type { CSSProperties } from "react";
import { mix } from "./colors";
import type { BackgroundLook } from "./types";

// Light designs for the studio wall, after real set lighting: a lamp pool, a halo, two coloured lamps, a
// ceiling beam, corner uplights, a cookie slash, blinds and window gobos, dappled leaves, bokeh practicals and
// an LED ring. Every design is anchored to where the speaker's head usually is (median face), so the
// brightest light sits behind the head and shoulders instead of floating above them. Pure CSS layers: the
// video and the studio's picker thumbnails draw the same thing.

export type LightPattern = BackgroundLook["pattern"];

export const LIGHT_PATTERNS: [LightPattern, string, string][] = [
  ["pool", "Soft pool", "A lamp aimed at the wall behind you"],
  ["halo", "Halo", "Round glow right behind your head"],
  ["split", "Two lamps", "Two pools, the second in the light colour"],
  ["beam", "Top beam", "A cone of light from the ceiling"],
  ["wash", "Uplights", "Lamps in the corners shine up the wall"],
  ["slash", "Slash", "One soft diagonal stripe"],
  ["blinds", "Blinds", "Window-blind stripes"],
  ["window", "Window", "Sun through a window frame"],
  ["leaves", "Leaves", "Dappled light through a plant"],
  ["bokeh", "Bokeh", "Soft out-of-focus lights"],
  ["ring", "Ring", "An LED ring behind your head"],
  ["side", "Side wash", "Coloured light washing in from one side"],
];

/** Where the head sits in the picture when there is no face track. */
export const HOME: [number, number] = [0.5, 0.36];

const ASPECT = 9 / 16; // frame width / height: an ellipse rx% ry% with ry = rx * ASPECT is round
const pc = (v: number) => `${+(v * 100).toFixed(2)}%`;
const a = (hex: string, v: number) =>
  hex +
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");
/** A 200%-size layer centred on (x, y): its gradients drawn at 50% 50% land there. */
const around = (x: number, y: number): CSSProperties => ({
  left: pc(x - 1),
  top: pc(y - 1),
  width: "200%",
  height: "200%",
});
const masked = (mask: string): CSSProperties => ({
  maskImage: mask,
  WebkitMaskImage: mask,
});
/** A lamp's falloff: fast, then long (light dims with distance), so no hard rim. */
const falloff = (c: string, peak = 1) =>
  [0.92, 0.72, 0.45, 0.24, 0.1, 0]
    .map((v, i) => `${a(c, v * peak)} ${[0, 14, 32, 52, 74, 100][i]}%`)
    .join(", ");
const round = (x: number, y: number, r: number, stops: string) =>
  `radial-gradient(${pc(r)} ${pc(r * ASPECT)} at ${pc(x)} ${pc(y)}, ${stops})`;

const BOKEH = [
  [0.13, 0.15, 0.07],
  [0.83, 0.11, 0.09],
  [0.3, 0.29, 0.05],
  [0.71, 0.33, 0.06],
  [0.91, 0.43, 0.08],
  [0.09, 0.5, 0.1],
  [0.61, 0.07, 0.05],
  [0.41, 0.12, 0.04],
  [0.2, 0.68, 0.06],
  [0.86, 0.71, 0.07],
  [0.52, 0.21, 0.035],
];

/**
 * Layers (absolutely positioned, later ones on top) for a studio wall: `color` is the wall, `color2` the
 * light, `light_color` the second lamp and bokeh accents. anchor = head position, drift = -1..1 slow sway,
 * k = frame width / 1080 for blur sizes.
 */
export const wallLayers = (
  bg: BackgroundLook,
  [ax, ay]: [number, number],
  drift: number,
  k: number,
): CSSProperties[] => {
  const L = bg.color2;
  const W = bg.color;
  const hot = mix(L, "#ffffff", 0.2);
  const dark = mix(W, "#000000", 0.55);
  const d = drift * 0.015;
  const blur = (px: number) => `blur(${px * k}px)`;
  const base: CSSProperties = {
    background: `radial-gradient(115% 85% at ${pc(ax)} ${pc(ay)}, ${W} 22%, ${dark} 100%)`,
  };
  // A faint lamp behind the head that the patterned designs keep, so the speaker never sits on a dead wall.
  const ambient = (peak: number): CSSProperties => ({
    background: `radial-gradient(62% 36% at ${pc(ax)} ${pc(ay - 0.02)}, ${falloff(L, peak)})`,
  });
  switch (bg.pattern) {
    case "halo":
      return [
        base,
        {
          background: [
            round(ax, ay - 0.01, 0.46, `${a(hot, 1)} 0%, ${a(hot, 0.85)} 34%, ${a(L, 0.5)} 60%, ${a(L, 0.16)} 82%, transparent 100%`),
            round(ax, ay, 0.85, `${a(L, 0.28)} 0%, transparent 75%`),
          ].join(", "),
        },
      ];
    case "split":
      return [
        base,
        {
          background: [
            `radial-gradient(46% 30% at ${pc(ax - 0.34 + d)} ${pc(ay - 0.06)}, ${falloff(hot)})`,
            `radial-gradient(46% 30% at ${pc(ax + 0.34 - d)} ${pc(ay - 0.02)}, ${falloff(bg.light_color, 0.85)})`,
          ].join(", "),
        },
      ];
    case "beam":
      return [
        base,
        ambient(0.35),
        {
          background: `conic-gradient(from 180deg at ${pc(ax + d)} -6%, ${a(hot, 0.7)} 0deg, ${a(L, 0.45)} 9deg, transparent 17deg 343deg, ${a(L, 0.45)} 351deg, ${a(hot, 0.7)} 360deg)`,
          filter: blur(22),
          ...masked(`linear-gradient(180deg, black 0%, black 30%, transparent ${pc(ay + 0.34)})`),
        },
        { background: `radial-gradient(30% 9% at ${pc(ax + d)} 0%, ${a(hot, 0.6)}, transparent 80%)` },
      ];
    case "wash":
      return [
        base,
        ambient(0.3),
        {
          background: [
            `radial-gradient(24% 100% at ${pc(0.04 + d)} 102%, ${falloff(hot)})`,
            `radial-gradient(24% 100% at ${pc(0.96 - d)} 102%, ${falloff(hot)})`,
          ].join(", "),
        },
      ];
    case "slash":
      return [
        base,
        ambient(0.3),
        {
          ...around(ax + 0.04 + d, ay - 0.02),
          background: `linear-gradient(118deg, transparent 44%, ${a(L, 0.72)} 47.5%, ${a(hot, 0.85)} 49.5%, ${a(L, 0.72)} 51.5%, transparent 55%)`,
          filter: blur(10),
          ...masked("radial-gradient(28% 24% at 50% 50%, black 30%, transparent 100%)"),
        },
      ];
    case "blinds":
      return [
        base,
        ambient(0.3),
        {
          ...around(ax + 0.08 + d, ay - 0.03),
          background: `repeating-linear-gradient(162deg, transparent 0%, ${a(L, 0.7)} 0.7%, ${a(hot, 0.75)} 2.9%, transparent 3.6%, transparent 5.4%)`,
          filter: blur(5),
          ...masked("radial-gradient(30% 22% at 50% 50%, black 25%, transparent 100%)"),
        },
      ];
    case "window": {
      const pane = `linear-gradient(${a(hot, 0.8)}, ${a(L, 0.62)})`;
      return [
        base,
        ambient(0.3),
        {
          left: pc(ax + 0.1 + d - 0.26),
          top: pc(ay - 0.04 - 0.16),
          width: pc(0.52),
          height: pc(0.32),
          background: ["0 0", "100% 0", "0 100%", "100% 100%"]
            .map((at) => `${pane} ${at} / 47% 47% no-repeat`)
            .join(", "),
          transform: "skewX(-14deg) rotate(-5deg)",
          filter: blur(7),
          ...masked("radial-gradient(70% 70% at 50% 50%, black 45%, transparent 100%)"),
        },
      ];
    }
    case "leaves": {
      const blobs = Array.from({ length: 30 }, (_, i) => {
        const turn = i * 2.39996 + drift * 0.08; // golden-angle spiral, gently swaying
        const r = Math.sqrt((i + 0.5) / 30) * 0.2;
        const size = 0.022 + ((i * 7) % 5) * 0.01;
        return round(
          0.5 + Math.cos(turn) * r,
          0.5 + Math.sin(turn) * r * 0.75,
          size,
          `${a(hot, 0.8)} 0%, ${a(L, 0.55)} 55%, transparent 100%`,
        );
      });
      return [
        base,
        ambient(0.38),
        {
          ...around(ax + 0.06, ay - 0.04),
          background: blobs.join(", "),
          filter: blur(14),
          ...masked("radial-gradient(30% 22% at 50% 50%, black 35%, transparent 100%)"),
        },
      ];
    }
    case "bokeh":
      return [
        base,
        ambient(0.5),
        {
          background: BOKEH.map(([x, y, r], i) => {
            const c = [L, bg.light_color, hot][i % 3];
            const v = 0.22 + (i % 4) * 0.05;
            return round(
              x,
              y - drift * 0.008 * ((i % 3) + 1),
              r,
              `${a(c, v * 0.7)} 0%, ${a(c, v * 0.8)} 80%, ${a(c, v)} 90%, transparent 100%`,
            );
          }).join(", "),
          filter: blur(4),
        },
      ];
    case "side":
      // A coloured lamp off to the right and low: its light washes up the wall on that side and spills across
      // the lower half (the creator's blue-haze reference). light_color is the lamp; color2 lifts the wall.
      return [
        base,
        ambient(0.4),
        {
          background: [
            `radial-gradient(75% 55% at ${pc(1.02 - d)} 86%, ${a(bg.light_color, 0.95)} 0%, ${a(bg.light_color, 0.6)} 35%, ${a(bg.light_color, 0.18)} 70%, transparent 100%)`,
            `radial-gradient(130% 60% at 70% 104%, ${a(bg.light_color, 0.45)}, transparent 75%)`,
            `radial-gradient(60% 40% at ${pc(0.08 + d)} 8%, ${a(hot, 0.22)}, transparent 75%)`,
          ].join(", "),
        },
      ];
    case "ring": {
      const ring = (r: number, w: number, v: number) =>
        round(ax, ay - 0.02, r, `transparent ${pc(1 - w)}, ${a(hot, v)} ${pc(1 - w / 2)}, transparent 100%`);
      return [
        base,
        ambient(0.45),
        // A thin bright tube with a soft bloom around it.
        { background: [ring(0.44, 0.05, 0.95), ring(0.47, 0.22, 0.35)].join(", "), filter: blur(1.5) },
      ];
    }
    default:
      // pool: an off-centre oval hot spot behind the head, with a wide faint spill from the lamp above.
      return [
        base,
        {
          background: [
            `linear-gradient(112deg, transparent 32%, ${a("#ffffff", 0.035)} 46%, transparent 62%)`,
            `radial-gradient(60% 34% at ${pc(ax + 0.05 + d)} ${pc(ay - 0.01)}, ${falloff(L)})`,
            `radial-gradient(70% 45% at ${pc(ax - 0.1 + d)} ${pc(ay - 0.12)}, ${a(mix(L, "#ffffff", 0.15), 0.28)}, transparent 75%)`,
          ].join(", "),
        },
      ];
  }
};
