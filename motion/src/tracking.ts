import type { FaceSample, HandSample, ShortEvent, Tracks } from "./types";

const HOLD = 3; // gesture must hold this many frames to trigger
export const FADE = 5; // frames to fade when tracking is lost or regained

export type Side = "left" | "right";

/** First frame (and hand) where a hand sticker should appear, or null. */
export const findTrigger = (
  tracks: Tracks,
  event: ShortEvent,
  fps: number,
): { frame: number; side: Side } | null => {
  const sides: Side[] = event.hand === "any" ? ["left", "right"] : [event.hand];
  const from = Math.round(event.start * fps);
  const to = Math.round(event.end * fps);
  for (let f = from; f <= to; f++) {
    for (const side of sides) {
      const track = tracks.hands[side];
      let ok = true;
      for (let k = 0; k < (event.trigger === "time" ? 1 : HOLD); k++) {
        const s = track[f + k];
        if (!s || (event.trigger !== "time" && s[5] !== event.trigger)) {
          ok = false;
          break;
        }
      }
      if (ok) return { frame: f, side };
    }
  }
  return null;
};

/**
 * Sample at frame, holding the last seen value through short tracking drops (motion blur) and
 * reporting visibility 0-1: fully visible for the first `hold` lost frames, then a FADE-frame fade.
 */
export const follow = <T extends HandSample | FaceSample>(
  track: (T | null)[],
  frame: number,
  hold = 0,
): { sample: T; visible: number } | null => {
  for (let back = 0; back <= hold + FADE; back++) {
    const sample = track[frame - back];
    if (!sample) continue;
    let run = 0;
    while (run < FADE && track[frame - back - run - 1]) run++;
    const fadeIn = Math.min(1, (run + 1) / FADE);
    const fadeOut = back <= hold ? 1 : 1 - (back - hold) / (FADE + 1);
    return { sample, visible: Math.min(fadeIn, fadeOut) };
  }
  return null;
};

/** Smoothed face centre for zoom focus; falls back to the upper middle. */
export const faceAt = (tracks: Tracks, frame: number): [number, number] => {
  for (let back = 0; back < 30; back++) {
    const s = tracks.face[frame - back];
    if (s) return [s[0], s[1]];
    if (tracks.cuts.includes(frame - back)) break;
  }
  return [0.5, 0.4];
};

const homes = new WeakMap<Tracks, [number, number]>();
/** Where the head usually is (median face centre over the edit): steady, for lights fixed to the wall. */
export const faceHome = (tracks: Tracks): [number, number] => {
  const known = homes.get(tracks);
  if (known) return known;
  const faces = tracks.face.filter((f): f is FaceSample => !!f);
  const median = (i: number) =>
    faces.map((f) => f[i] as number).sort((a, b) => a - b)[
      Math.floor(faces.length / 2)
    ];
  const home: [number, number] =
    faces.length < 10 ? [0.5, 0.36] : [median(0), median(1)];
  homes.set(tracks, home);
  return home;
};

export type Reframe = {
  s: number;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
};
const REFRAME_FACE = 0.27; // face height share in a chest-up podcast framing
const REFRAME_Y = 0.38; // where the face centre lands

/**
 * One steady punch-in for the whole edit (no motion): scale so the typical face reaches a chest-up size,
 * then move it toward the upper-middle, never exposing an edge of the frame. strength 0 = off, 1 = full.
 */
export const reframeFor = (tracks: Tracks, strength: number): Reframe => {
  const faces = tracks.face.filter((f): f is FaceSample => !!f);
  if (strength <= 0 || faces.length < 10)
    return { s: 1, ox: 0.5, oy: 0.5, tx: 0, ty: 0 };
  const median = (i: number) =>
    [...faces.map((f) => f[i] as number)].sort((a, b) => a - b)[
      Math.floor(faces.length / 2)
    ];
  const [ox, oy, h] = [median(0), median(1), median(2)];
  const s = Math.min(1.6, Math.max(1, 1 + (REFRAME_FACE / h - 1) * strength));
  // Range of shifts that keep the scaled picture covering the frame: [(1-o)(1-s), o(s-1)].
  const fit = (want: number, o: number) =>
    Math.min(o * (s - 1), Math.max((1 - o) * (1 - s), want));
  return {
    s,
    ox,
    oy,
    tx: fit((0.5 - ox) * strength, ox),
    ty: fit((REFRAME_Y - oy) * strength, oy),
  };
};

/** Where a point of the original picture ends up after the reframe (normalized y). */
export const reframeY = (r: Reframe, y: number) =>
  r.oy + (y - r.oy) * r.s + r.ty;
