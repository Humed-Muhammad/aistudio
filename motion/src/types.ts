import type { Caption } from "@remotion/captions";
import type { LottieAnimationData } from "@remotion/lottie";

// Mirrors Event / Plan in shorts.py.
export type ShortEvent = {
  type:
    | "text"
    | "sticker"
    | "zoom"
    | "shake"
    | "flash"
    | "sfx"
    | "broll"
    | "card"
    | "no_captions"
    | "look";
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
  src_start: number;
  speed: number;
  layout: "full" | "split" | "bubble" | "front";
  corner: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  template:
    | "steps"
    | "slider"
    | "stat"
    | "icons"
    | "list"
    | "chips"
    | "quote"
    | "title"
    | "progress";
  items: string[];
  value: string;
  label: string;
  active: number;
  scene: "overlay" | "dim" | "dark" | "light" | "split";
  side: "top" | "bottom" | "left" | "right";
  timeline: [number, number][];
  look?: string;
};

export type ClipInfo = { duration: number; width: number; height: number };

export type BackgroundLook = {
  mode:
    | "original"
    | "blur"
    | "glow"
    | "color"
    | "gradient"
    | "studio"
    | "grid"
    | "image";
  color: string;
  color2: string;
  image: string;
  blur: number;
  dim: number;
  light_color: string;
  glow: number;
  rim: number;
  vignette: number;
  spotlight: number;
  shadow: number;
  outline: number;
  outline_color: string;
  scale: number;
  wrap: number;
  reframe: number;
  grade: number;
  grain: number;
  tube: "none" | "left" | "right" | "both";
};

export type Plan = {
  background?: BackgroundLook;
  caption_preset:
    | "duo"
    | "karaoke"
    | "pill"
    | "typewriter"
    | "quiet"
    | "float"
    | "stack"
    | "clean"
    | "editorial"
    | "rise"
    | "bold"
    | "minimal"
    | "boxed"
    | "none";
  caption_font?:
    | "noto_black"
    | "noto_condensed"
    | "noto_bold"
    | "menbere"
    | "agbalumo"
    | "abyssinica"
    | "classic";
  caption_motion?: "pop" | "word" | "rise";
  caption_fill?: "glass" | "chrome" | "glow" | "solid";
  caption_place?: "face" | "fixed";
  caption_case?: "capital" | "upper" | "spoken";
  graphics_style?:
    | "glass"
    | "bold"
    | "editorial"
    | "minimal"
    | "tech"
    | "brutal"
    | "aurora"
    | "candy"
    | "noir"
    | "swiss"
    | "clay";
  graphics_auto?: boolean;
  captions_auto?: boolean;
  caption_y: number;
  highlight_color: string;
  progress_bar: boolean;
  emphasis: string[];
  auto_sound: boolean;
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
  /** Levelled voice (voice-level.wav); when set, the video's own sound is muted. */
  voice?: string | null;
  foreground: string | null;
  captions: Caption[];
  tracks: Tracks;
  plan: Plan;
  clips: Record<string, ClipInfo>;
  assets: string[];
  lottie: Record<string, LottieAnimationData>;
  /** Full settings of the looks used by look-switch events. */
  looks?: Record<string, BackgroundLook>;
  /** Job folder URL for the in-browser Player; the renderer leaves it unset. */
  base?: string | null;
};
