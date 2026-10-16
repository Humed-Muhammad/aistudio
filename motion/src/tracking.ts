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
