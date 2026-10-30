import type { Film, FilmProps, Scene, SceneMeta } from "../../../src/film/types";
import { api } from "../api";

export type { Film, FilmProps, Scene, SceneMeta };

/** One background task of a film: Claude (make, chat) or a render. */
export type Task = {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  status: string;
  action?: string;
  progress?: number | null;
  started?: number;
  finished?: number;
  final?: boolean;
  model?: string;
};

export type FilmSummary = {
  id: string;
  title: string;
  created: number;
  updated: number;
  client: string | null;
  format: Film["format"];
  scenes: number;
  duration: number;
  stage: "New" | "Draft" | "Draft ready" | "Final ready";
  thumb: string | null;
  state: Task["state"];
  action: string | null;
  progress: number | null;
  status: string;
  delivery: "" | "sent" | "delivered";
};

export type ClaudeRun = { kind: "make" | "chat"; request: string; model: string; started: number; finished: number; summary: string; backup?: string; undone?: boolean; changes?: string[] };

export type FilmState = FilmSummary & {
  job: { title: string; created: number; client: string | null; request: string; starter: string | null };
  film: Film;
  warnings: string[];
  spec: string;
  assets: string[];
  renders: { draft?: number; final?: number };
  edited: number | null;
  claude: Task;
  render: Task;
  can_undo: boolean;
  runs: ClaudeRun[];
};

export type FilmSetup = {
  claude: boolean;
  models: Record<string, string>;
  formats: Record<Film["format"], [number, number]>;
  styles: string[];
  backdrops: string[];
  transitions: string[];
  cameras: string[];
  palette: Record<string, string>;
};

export type Starter = { id: string; title: string; description: string; use: string; film: Film };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  time: number;
  changes?: string[];
  warnings?: string[];
  error?: string;
  backup?: string | null;
  undone?: boolean;
};
export type ChatState = { messages: ChatMessage[]; claude: boolean; status: Task; film: FilmState };

export const filmUrl = (id: string, path = "") => `/motion/films/${id}${path ? "/" + path : ""}`;
export const getFilm = (id: string) => api<FilmState>(filmUrl(id));

export const FORMAT_NAMES: Record<Film["format"], string> = { portrait: "9:16 Vertical", square: "1:1 Square", feed: "4:5 Feed", landscape: "16:9 Wide" };
export const STYLE_NAMES: Record<string, string> = {
  glass: "Liquid glass",
  bold: "Bold block",
  editorial: "Editorial",
  minimal: "Minimal",
  tech: "Tech",
  brutal: "Neo-brutal",
  aurora: "Aurora",
  candy: "Candy",
  noir: "Noir",
  swiss: "Swiss",
  clay: "Clay",
  cartoon: "Cartoon",
};
export const BACKDROP_NAMES: Record<string, string> = {
  aurora: "Aurora glow",
  mesh: "Colour mesh",
  grid: "Grid",
  dots: "Dots",
  spotlight: "Spotlight",
  rays: "Light rays",
  plain: "Style colour",
  paper: "Paper",
  cartoon: "Cartoon sky",
};
export const TRANSITION_NAMES: Record<string, string> = {
  push: "Push",
  slide: "Slide",
  zoom: "Zoom through",
  blur: "Blur",
  whip: "Whip",
  wipe: "Wipe",
  iris: "Circle",
  flip: "Flip",
  fade: "Fade",
  cut: "Cut",
};
export const CAMERA_NAMES: Record<string, [string, string]> = {
  still: ["Still", "Scenes sit still; only their elements move."],
  drift: ["Drift", "A slow push-in on every scene, so the frame is never frozen."],
  world: ["3D world", "Every scene hangs in one 3D space and the camera flies between them."],
};
export const ACTION_NAMES: Record<string, string> = { make: "Claude is making your film", chat: "Claude is editing", render: "Rendering" };
