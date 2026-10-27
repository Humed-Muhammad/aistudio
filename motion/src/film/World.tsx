import {
  AbsoluteFill,
  Freeze,
  interpolate,
  random,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mix } from "../colors";
import { kitFor } from "../graphicKits";
import { Backdrop } from "./Backdrop";
import { EASE_IN_OUT } from "./motion";
import { SceneView, type timeline } from "./Film";
import type { Film } from "./types";

// Camera "world": every scene hangs on its own panel in one 3D space and the camera flies from panel to panel in a
// single continuous move (pull back, travel, settle in), with floating shapes and a floor passing by for depth.
// CSS 3D only: light enough for a laptop, identical in the preview and the file.

/** Frames each flight takes (the overlap between two scenes). */
export const WORLD_FRAMES = 26;
const FADE = 14;

/** Where panel i hangs: to the right of the last, alternating height, depth and a slight turn. */
const stop = (i: number, w: number, h: number) => ({
  x: i * w * 1.32,
  y: (i % 2 ? -0.07 : 0.05) * h,
  z: -(i % 3) * 420,
  ry: i % 2 ? -16 : 14,
});

export const World: React.FC<{
  film: Film;
  rows: ReturnType<typeof timeline>;
}> = ({ film, rows }) => {
  const frame = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  const k = Math.min(w, h) / 1080;
  const kit = kitFor(film.style);
  const dark = film.mode === "dark";

  // Camera: at panel i while scene i plays; during the overlap into i+1 it flies there.
  // The camera rests a little back from each panel, so it floats in the world instead of filling the frame.
  const rest = 190 * k;
  let cam = { ...stop(0, w, h), back: rest, tilt: 0 };
  rows.forEach((r, i) => {
    if (i === 0 || frame < r.from) return;
    const p = EASE_IN_OUT(
      interpolate(frame, [r.from, r.from + WORLD_FRAMES], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
    const a = stop(i - 1, w, h);
    const b = stop(i, w, h);
    const arc = Math.sin(p * Math.PI);
    cam = {
      x: a.x + (b.x - a.x) * p,
      y: a.y + (b.y - a.y) * p,
      z: a.z + (b.z - a.z) * p,
      ry: a.ry + (b.ry - a.ry) * p,
      back: rest + arc * 900 * k,
      tilt: arc * 4,
    };
  });
  // Between flights the camera keeps breathing a little.
  const breathe = Math.sin(frame / 40) * 12 * k;
  // No shared 3D scene (preserve-3d): Chrome splits and sorts its planes on the GPU and, under memory pressure, drops
  // tiles (black frames, half-drawn panels). Each object carries the camera in its own transform instead, projected
  // about the frame's centre, and is drawn back to front.
  const camera = `perspective(${1800 * k}px) translateZ(${-cam.back}px) rotateX(${cam.tilt}deg) rotateY(${-cam.ry}deg) translate3d(${-cam.x}px, ${-cam.y + breathe}px, ${-cam.z}px)`;
  /** Transform origin that puts the projection centre on the middle of the frame, for an object at (left, top). */
  const centre = (left: number, top: number) =>
    `${w / 2 - left}px ${h / 2 - top}px`;

  // Floating shapes along the path, placed once from a seed: most hang behind the panels; a few big ones float in
  // front, in the gaps between panels, so they pass the camera during flights but never cover a scene's words.
  const span = rows.length * w * 1.32;
  const shapes = Array.from(
    { length: Math.max(8, rows.length * 5) },
    (_, n) => {
      const r = (s: string) => random(`world-${n}-${s}`);
      const front = r("front") > 0.72;
      const colors = [
        film.accent,
        film.accent2,
        mix(film.accent, "#ffffff", 0.5),
        dark ? "#2a2f3a" : "#ffffff",
      ];
      const gap = Math.floor(r("x") * Math.max(1, rows.length - 1)) + 0.5;
      return {
        x: front
          ? gap * w * 1.32 + (r("gx") - 0.5) * w * 0.2
          : -w * 0.6 + r("x") * (span + w * 0.2),
        y: front
          ? (r("y") > 0.5 ? 1 : -1) * h * (0.25 + r("gy") * 0.2)
          : (r("y") - 0.5) * h * 1.4,
        z: front ? 260 + r("z") * 380 : -1200 - r("z") * 1500,
        size: (front ? 120 + r("s") * 160 : 60 + r("s") * 220) * k,
        color: colors[Math.floor(r("c") * colors.length)],
        ring: r("ring") > 0.75,
        bob: r("b") * 6.28,
      };
    },
  );

  // Shapes far from the camera are out of view: leaving them out keeps each frame light.
  const seen = shapes
    .map((s, n) => ({ ...s, n }))
    .filter((s) => Math.abs(s.x - cam.x) < w * 2.6);
  const shape = (s: (typeof seen)[number]) => {
    const left = w / 2 - s.size / 2;
    const top = h / 2 - s.size / 2;
    return (
      <div
        key={s.n}
        style={{
          position: "absolute",
          left,
          top,
          width: s.size,
          height: s.size,
          borderRadius: "50%",
          transformOrigin: centre(left, top),
          transform: `${camera} translate3d(${s.x}px, ${s.y + Math.sin(frame / 30 + s.bob) * 18 * k}px, ${s.z}px)`,
          background: s.ring
            ? "transparent"
            : `radial-gradient(circle at 32% 28%, ${mix(s.color, "#ffffff", 0.55)}, ${s.color} 45%, ${mix(s.color, "#000000", 0.35)} 100%)`,
          border: s.ring ? `${s.size * 0.12}px solid ${s.color}` : undefined,
          boxShadow: s.ring
            ? undefined
            : `0 ${s.size * 0.3}px ${s.size * 0.5}px rgba(0,0,0,${dark ? 0.35 : 0.12})`,
          opacity: 0.9,
        }}
      />
    );
  };
  // Floor far below the panels, fading into the distance. Only the stretch under the camera exists, snapped to the
  // grid so the lines never visibly slide.
  const floorLeft = Math.round((cam.x - w * 2) / (160 * k)) * 160 * k;
  const line = dark ? "rgba(255,255,255,.05)" : "rgba(20,30,60,.06)";
  // Panels near in time, drawn from the farthest to the nearest.
  const panels = rows
    .filter(
      ({ from, frames }) =>
        frame >= from - WORLD_FRAMES && frame < from + frames + FADE,
    )
    .sort((a, b) => stop(a.index, w, h).z - stop(b.index, w, h).z);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Backdrop
        name={film.backdrop}
        kit={kit}
        mode={film.mode}
        accent={film.accent}
        accent2={film.accent2}
        shift={{ x: -Math.sin(cam.x / (w * 3)) * 400 * k, y: cam.y * 0.5 }}
      />
      <div
        style={{
          position: "absolute",
          left: floorLeft,
          top: h * 0.5,
          width: w * 5,
          height: 2600 * k,
          transformOrigin: `${w / 2 - floorLeft}px 0px`,
          transform: `${camera} translate3d(0, ${h * 0.45}px, ${-2000 * k}px) rotateX(90deg)`,
          background: `linear-gradient(${line} ${2 * k}px, transparent ${2 * k}px) 0 0 / ${160 * k}px ${160 * k}px, linear-gradient(90deg, ${line} ${2 * k}px, transparent ${2 * k}px) 0 0 / ${160 * k}px ${160 * k}px`,
          maskImage:
            "linear-gradient(transparent, #000 30%, #000 60%, transparent)",
          WebkitMaskImage:
            "linear-gradient(transparent, #000 30%, #000 60%, transparent)",
        }}
      />
      {seen.filter((s) => s.z < 0).map(shape)}
      {panels.map(({ scene, from, frames, index }) => {
        const s = stop(index, w, h);
        const ended = frame >= from + frames;
        const opacity = ended
          ? interpolate(frame, [from + frames, from + frames + FADE], [1, 0], {
              extrapolateRight: "clamp",
            })
          : 1;
        return (
          <div
            key={scene.id}
            style={{
              position: "absolute",
              inset: 0,
              transform: `${camera} translate3d(${s.x}px, ${s.y}px, ${s.z}px) rotateY(${s.ry}deg)`,
              opacity,
            }}
          >
            {/* The panel itself: a soft card so scenes read as objects in space. */}
            <div
              style={{
                position: "absolute",
                inset: 26 * k,
                borderRadius: 64 * k,
                background: dark
                  ? "linear-gradient(160deg, rgba(255,255,255,.07), rgba(255,255,255,.02))"
                  : "linear-gradient(160deg, rgba(255,255,255,.75), rgba(255,255,255,.35))",
                border: `${2 * k}px solid ${dark ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.9)"}`,
                boxShadow: `0 ${40 * k}px ${80 * k}px rgba(0,0,0,${dark ? 0.4 : 0.12})`,
              }}
            />
            <Sequence from={from} durationInFrames={frames + FADE}>
              {ended ? (
                <Freeze frame={frames - 1}>
                  <SceneView
                    film={film}
                    scene={scene}
                    index={index}
                    frames={frames}
                  />
                </Freeze>
              ) : (
                <SceneView
                  film={film}
                  scene={scene}
                  index={index}
                  frames={frames}
                />
              )}
            </Sequence>
          </div>
        );
      })}
      {seen.filter((s) => s.z >= 0).map(shape)}
    </AbsoluteFill>
  );
};
