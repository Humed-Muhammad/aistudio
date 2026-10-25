import type React from "react";
import type { Kit, Theme } from "../graphicKits";
import type { Field, FieldValue } from "../elements/types";

// Motion Studio films: promos, product films and explainers drawn entirely in code. A film is one JSON file
// (runs/films/JOB/film.json, checked by films.py) and a list of scenes. Every scene is a template from
// film/scenes (pack: shipped, mine: made on this Mac) with its own field values, so words, colours and order
// change without touching code. Nothing needs a photo: UI, type, icons, charts and 3D are drawn here.

export type Format = "portrait" | "square" | "feed" | "landscape";
export const SIZES: Record<Format, [number, number]> = {
  portrait: [1080, 1920],
  square: [1080, 1080],
  feed: [1080, 1350],
  landscape: [1920, 1080],
};

/** How one scene hands over to the next (film/transitions.tsx). */
export type TransitionName = "push" | "slide" | "zoom" | "blur" | "whip" | "wipe" | "iris" | "flip" | "fade" | "cut";
/** The film's backdrop, drawn under every scene and continuous across cuts (film/Backdrop.tsx). */
export type BackdropName = "aurora" | "mesh" | "grid" | "dots" | "spotlight" | "rays" | "plain" | "paper";
/** Camera: still, a slow drift inside each scene, or one continuous flight through a 3D world. */
export type CameraName = "still" | "drift" | "world";

export type Scene = {
  /** Stable id, so the chat and the editor can point at a scene after reordering. */
  id: string;
  template: string;
  /** Seconds, including its share of the transition into the next scene. */
  duration: number;
  /** Field values (defaults from the template's JSON fill the rest). */
  props: Record<string, FieldValue>;
  /** Into the next scene; empty uses the film's transition. */
  transition?: TransitionName | "";
  accent?: string;
  /** Light or dark surfaces for this scene only; empty uses the film's mode. */
  mode?: "dark" | "light" | "";
  /** A note for the creator and Claude (what this scene is for). Not drawn. */
  note?: string;
};

export type Film = {
  version: 1;
  title: string;
  format: Format;
  /** Graphic style id from graphicKits.ts (glass, bold, editorial, tech, clay…). */
  style: string;
  mode: "dark" | "light";
  accent: string;
  /** Second colour for gradients, charts and backdrops. */
  accent2: string;
  backdrop: BackdropName;
  transition: TransitionName;
  camera: CameraName;
  /** Brand: name and optional logo image (assets/…), drawn by brand scenes and the logo mark. */
  brand: { name: string; logo: string };
  /** Language of the on-screen words (am = Ethiopic script). */
  language: "am" | "en" | "om";
  sound: {
    /** Sound effects placed on the motion (whoosh on transitions, pops, clicks), levelled automatically. */
    auto: boolean;
    /** Music bed in assets/, looped and faded; empty for none. */
    music: string;
    music_volume: number;
    /** The creator's own voice-over in assets/, played unchanged from the start; empty for none. */
    voice: string;
  };
  scenes: Scene[];
};

/** One sound a scene asks for, in frames from the scene's start. */
export type Cue = { frame: number; sound: SoundName };
export type SoundName = "whoosh" | "pop" | "click" | "success" | "impact" | "riser" | "hit" | "camera";

export type SceneMeta = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Default length in seconds. */
  duration: number;
  /** Shortest length that still reads (seconds). */
  min: number;
  /** Which moment the thumbnail shows, as a fraction of the duration. */
  poster?: number;
  /** Sound when it appears ("none" for quiet scenes); scenes that export cues() place their own. */
  sound: SoundName | "none";
  fields: Field[];
};

export type Values = Record<string, FieldValue>;

/** Everything a scene template receives. Designs are made for a 1080 short side: multiply px by k. */
export type SceneProps = {
  v: Values;
  theme: Theme;
  kit: Kit;
  accent: string;
  accent2: string;
  durationInFrames: number;
  width: number;
  height: number;
  k: number;
  /** portrait (tall), square-ish or landscape (wide): lay out for it. */
  shape: "tall" | "square" | "wide";
  brand: Film["brand"];
  /** Elements leave by themselves at the end (the transition is a cut or a fade); otherwise the transition carries them. */
  exits: boolean;
};

export type SceneModule = {
  default: React.FC<SceneProps>;
  /** Sound cues for this scene with these values (same timing the scene animates with). */
  cues?: (v: Values, durationInFrames: number, fps: number) => Cue[];
};

export type SceneEntry = { meta: SceneMeta; Component: React.FC<SceneProps>; cues?: SceneModule["cues"]; source: "pack" | "mine" };

/** A sound file the render copied into the job's sfx/ folder: its loudest moment and the gain that levels it. */
export type SoundFile = { file: string; peak: number; gain: number };

/** What the renderer and the live preview receive: the checked film and the job's media. */
export type FilmProps = {
  film: Film;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  /** Job folder URL in the browser preview (/runs/films/ID/); empty when rendering (the folder is the public dir). */
  base?: string | null;
  sounds: Partial<Record<SoundName, SoundFile>>;
  /** Images in assets/ that scenes may show (logo, screenshots); never required. */
  assets: string[];
};
