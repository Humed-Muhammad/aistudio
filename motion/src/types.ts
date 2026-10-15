import type { Caption } from "@remotion/captions";

// Mirrors Event / Plan in shorts.py.
export type ShortEvent = {
  type: "text" | "sticker" | "zoom" | "shake" | "flash" | "sfx";
  start: number;
  end: number;
  text: string;
  style: "pop" | "slide" | "type";
  color: string;
  background: "none" | "pill";
  size: number;
  x: number;
  y: number;
  behind_subject: boolean;
  asset: string;
  emoji: string;
  anchor: "screen" | "hand" | "face";
  hand: "any" | "left" | "right";
  point: "palm" | "above_palm" | "fingertip" | "above_head" | "beside_face";
  trigger:
    | "time"
    | "open_palm"
    | "fist"
    | "point"
    | "pinch"
    | "peace"
    | "thumbs_up"
    | "rock";
  animation: "pop" | "spin" | "drop" | "fade";
  idle: "float" | "pulse" | "spin" | "none";
  scale: number;
  focus: "face" | "center";
  intensity: number;
  sound: string;
  volume: number;
};

export type Plan = {
  caption_preset: "bold" | "minimal" | "boxed" | "none";
  caption_y: number;
  highlight_color: string;
  progress_bar: boolean;
  events: ShortEvent[];
  notes: string;
};

// Hand: [palmX, palmY, tipX, tipY, scale, gesture]; face: [x, y, height, ""]. Normalized 0-1.
export type HandSample = [number, number, number, number, number, string];
export type FaceSample = [number, number, number, string];

export type Tracks = {
  fps: number;
  width: number;
  height: number;
  frames: number;
  cuts: number[];
  hands: { left: (HandSample | null)[]; right: (HandSample | null)[] };
  face: (FaceSample | null)[];
};

export type ShortsProps = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  video: string | null;
  foreground: string | null;
  captions: Caption[];
  tracks: Tracks;
  plan: Plan;
};
