import { AbsoluteFill, Freeze, interpolate, random, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
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

export const World: React.FC<{ film: Film; rows: ReturnType<typeof timeline> }> = ({ film, rows }) => {
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
    const p = EASE_IN_OUT(interpolate(frame, [r.from, r.from + WORLD_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    const a = stop(i - 1, w, h);
    const b = stop(i, w, h);
    const arc = Math.sin(p * Math.PI);
    cam = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, z: a.z + (b.z - a.z) * p, ry: a.ry + (b.ry - a.ry) * p, back: rest + arc * 900 * k, tilt: arc * 4 };
  });
  // Between flights the camera keeps breathing a little.
  const breathe = Math.sin(frame / 40) * 12 * k;
  const perspective = 1800 * k;
  const world: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    transform: `translateZ(${-cam.back}px) rotateX(${cam.tilt}deg) rotateY(${-cam.ry}deg) translate3d(${-cam.x}px, ${-cam.y + breathe}px, ${-cam.z}px)`,
  };

  // Floating shapes along the path, placed once from a seed: most hang behind the panels; a few big ones float in
  // front, in the gaps between panels, so they pass the camera during flights but never cover a scene's words.
  const span = rows.length * w * 1.32;
  const shapes = Array.from({ length: Math.max(8, rows.length * 5) }, (_, n) => {
    const r = (s: string) => random(`world-${n}-${s}`);
    const front = r("front") > 0.72;
    const colors = [film.accent, film.accent2, mix(film.accent, "#ffffff", 0.5), dark ? "#2a2f3a" : "#ffffff"];
    const gap = Math.floor(r("x") * Math.max(1, rows.length - 1)) + 0.5;
    return {
      x: front ? gap * w * 1.32 + (r("gx") - 0.5) * w * 0.2 : -w * 0.6 + r("x") * (span + w * 0.2),
      y: front ? (r("y") > 0.5 ? 1 : -1) * h * (0.25 + r("gy") * 0.2) : (r("y") - 0.5) * h * 1.4,
      z: front ? 260 + r("z") * 380 : -1200 - r("z") * 1500,
      size: (front ? 120 + r("s") * 160 : 60 + r("s") * 220) * k,
      color: colors[Math.floor(r("c") * colors.length)],
      ring: r("ring") > 0.75,
      bob: r("b") * 6.28,
    };
  });

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
      <AbsoluteFill style={{ perspective, perspectiveOrigin: "50% 50%" }}>
        <div style={world}>
          {/* Floor far below the panels, fading into the distance. */}
          <div
            style={{
              position: "absolute",
              left: -w,
              top: h * 0.5,
              width: span + w * 3,
              height: 4000 * k,
              transformOrigin: "50% 0",
              transform: `translate3d(0, ${h * 0.45}px, ${-2000 * k}px) rotateX(90deg)`,
              background: `linear-gradient(${dark ? "rgba(255,255,255,.05)" : "rgba(20,30,60,.06)"} ${2 * k}px, transparent ${2 * k}px) 0 0 / ${160 * k}px ${160 * k}px, linear-gradient(90deg, ${dark ? "rgba(255,255,255,.05)" : "rgba(20,30,60,.06)"} ${2 * k}px, transparent ${2 * k}px) 0 0 / ${160 * k}px ${160 * k}px`,
              maskImage: "linear-gradient(transparent, #000 30%, #000 60%, transparent)",
              WebkitMaskImage: "linear-gradient(transparent, #000 30%, #000 60%, transparent)",
            }}
          />
          {shapes.map((s, n) => (
            <div
              key={n}
              style={{
                position: "absolute",
                left: w / 2 - s.size / 2,
                top: h / 2 - s.size / 2,
                width: s.size,
                height: s.size,
                borderRadius: "50%",
                transform: `translate3d(${s.x}px, ${s.y + Math.sin(frame / 30 + s.bob) * 18 * k}px, ${s.z}px)`,
                background: s.ring ? "transparent" : `radial-gradient(circle at 32% 28%, ${mix(s.color, "#ffffff", 0.55)}, ${s.color} 45%, ${mix(s.color, "#000000", 0.35)} 100%)`,
                border: s.ring ? `${s.size * 0.12}px solid ${s.color}` : undefined,
                boxShadow: s.ring ? undefined : `0 ${s.size * 0.3}px ${s.size * 0.5}px rgba(0,0,0,${dark ? 0.35 : 0.12})`,
                opacity: 0.9,
              }}
            />
          ))}
          {rows.map(({ scene, from, frames, index }) => {
            const near = frame >= from - WORLD_FRAMES && frame < from + frames + FADE;
            if (!near) return null;
            const s = stop(index, w, h);
            const ended = frame >= from + frames;
            const opacity = ended ? interpolate(frame, [from + frames, from + frames + FADE], [1, 0], { extrapolateRight: "clamp" }) : 1;
            return (
              <div
                key={scene.id}
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: `translate3d(${s.x}px, ${s.y}px, ${s.z}px) rotateY(${s.ry}deg)`,
                  opacity,
                }}
              >
                {/* The panel itself: a soft card so scenes read as objects in space. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 26 * k,
                    borderRadius: 64 * k,
                    background: dark ? "linear-gradient(160deg, rgba(255,255,255,.07), rgba(255,255,255,.02))" : "linear-gradient(160deg, rgba(255,255,255,.75), rgba(255,255,255,.35))",
                    border: `${2 * k}px solid ${dark ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.9)"}`,
                    boxShadow: `0 ${60 * k}px ${140 * k}px rgba(0,0,0,${dark ? 0.45 : 0.14})`,
                  }}
                />
                <Sequence from={from} durationInFrames={frames + FADE}>
                  {ended ? (
                    <Freeze frame={frames - 1}>
                      <SceneView film={film} scene={scene} index={index} frames={frames} />
                    </Freeze>
                  ) : (
                    <SceneView film={film} scene={scene} index={index} frames={frames} />
                  )}
                </Sequence>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
