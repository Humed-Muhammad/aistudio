import type { BackgroundLook, Plan, ShortsProps } from "../../src/types";

export type Unit = {
  id: number;
  start: number;
  end: number;
  text: string;
  edited: boolean;
};
export type Cut = {
  keep: number[];
  tighten: boolean;
  max_pause: number;
  removed: { id: number; why: string }[];
  summary: string;
};
export type Clip = {
  name: string;
  duration: number;
  width: number;
  height: number;
  poster: string | null;
};
export type JobSummary = {
  id: string;
  title: string;
  created: number;
  duration: number | null;
  stage: string;
  thumb: string | null;
  state: "idle" | "running" | "done" | "error" | "cancelled";
  action: string | null;
  progress: number | null;
  status: string;
  client: string | null;
  delivery: "" | "sent" | "delivered";
  updated: number;
};

export type Client = {
  id: string;
  name: string;
  color: string;
  notes: string;
  kit: Record<string, unknown> | null;
  kit_summary: { look: string; captions: string; graphics: string; effect: string } | null;
  videos: number;
};

/** One status for a video in client work: where it is, and a tone for its pill. */
export type Status = { key: "editing" | "attention" | "new" | "review" | "draft" | "final" | "sent" | "delivered"; label: string };
export const statusOf = (j: JobSummary): Status =>
  j.state === "running"
    ? { key: "editing", label: `${ACTION[j.action ?? ""] ?? "Working"}${j.progress != null ? " " + Math.round(j.progress * 100) + "%" : "…"}` }
    : j.state === "error"
      ? { key: "attention", label: "Needs attention" }
      : j.delivery === "delivered"
        ? { key: "delivered", label: "Delivered" }
        : j.delivery === "sent"
          ? { key: "sent", label: "Sent to client" }
          : j.stage === "Final ready"
            ? { key: "final", label: "Final ready" }
            : j.stage === "Draft ready"
              ? { key: "draft", label: "Draft ready" }
              : j.stage === "New"
                ? { key: "new", label: "Transcribing" }
                : { key: "review", label: j.state === "cancelled" ? "Stopped" : j.stage };
export const STATUS_FILTERS: [string, string][] = [
  ["all", "All"],
  ["active", "In progress"],
  ["draft", "Draft ready"],
  ["final", "Final ready"],
  ["sent", "Sent"],
  ["delivered", "Delivered"],
];
export type Job = JobSummary & {
  started?: number;
  finished?: number;
  final?: boolean;
  manifest: { duration: number; width: number; height: number; frames: number; noise?: string; tracking?: "full" | "fast" | "off" } | null;
  plan: Plan | null;
  warnings: string[];
  assets: string[];
  clips: Clip[];
  files: Record<string, number>;
  units: Unit[];
  cut: Cut | null;
  cut_summary: {
    original: number;
    kept: number;
    parts: number;
    kept_parts: number;
    jumps: number;
    whole: boolean;
    /** Recording seconds [start, end] played in order (a hook first): previews the cut before it is built. */
    ranges?: [number, number][];
  } | null;
  tracking: { frames: number; cuts: number; face: number; left: number; right: number } | null;
  transcript: { language: string | null; text: string };
  cut_mtime: number | null;
  planner_available: boolean;
  noise: "off" | "light" | "strong";
  /** Tracking used at the next build: full (with cutout), fast (face and hands), off (screen recordings). */
  track_mode: "full" | "fast" | "off";
  voice: "level" | "off";
  strong_noise_available: boolean;
  language: "am" | "en" | "auto";
  transcript_check: { speech: number; missing: number } | null;
  stopping: boolean;
  captions_updated?: boolean;
  word_fixes: { id: number; old: string; new: string; why: string }[];
  post: { titles: string[]; caption: string; hashtags: string[]; best_time: string; notes: string } | null;
};

export type { BackgroundLook, Plan, ShortsProps };

export async function api<T = Job>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Error(
      typeof j.detail === "string" ? j.detail : "Something went wrong. Please try again.",
    );
  return j as T;
}

export const sendJSON = <T = Job>(url: string, method: string, body: unknown) =>
  api<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const jobUrl = (id: string, path = "") => `/shorts/jobs/${id}${path ? "/" + path : ""}`;
export const fileUrl = (id: string, name: string, version?: number) =>
  `/runs/${id}/${name}${version ? "?" + version : ""}`;

export const clock = (t: number | null | undefined) =>
  t == null ? "–" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export const ago = (s: number) => {
  const m = Math.round((Date.now() / 1000 - s) / 60);
  return m < 1
    ? "just now"
    : m < 60
      ? m + " min ago"
      : m < 1440
        ? Math.round(m / 60) + " h ago"
        : new Date(s * 1000).toLocaleDateString();
};

export const ACTION: Record<string, string> = {
  transcribe: "Transcribing",
  autocut: "Claude is choosing what to keep",
  fix: "Claude is checking the words",
  post: "Claude is writing your post",
  auto: "Editing for you",
  apply: "Building your edit",
  plan: "Claude is planning graphics",
  render: "Rendering",
};
export const FAIL: Record<string, string> = {
  transcribe: "We couldn't transcribe this video",
  autocut: "Auto-cut didn't finish",
  fix: "The word check didn't finish",
  post: "The post text didn't finish",
  apply: "We couldn't build your edit",
  plan: "Auto-plan didn't finish",
  render: "The render failed",
};

export function friendly(msg: string) {
  if (/ANTHROPIC_API_KEY/.test(msg))
    return "Claude isn’t set up yet: add ANTHROPIC_API_KEY to the .env file and restart the app. You can also do this step by hand.";
  if (/Interrupted/.test(msg)) return "The app was restarted while this was running.";
  if (/vertical/.test(msg)) return "This editor needs a vertical (9:16) video.";
  if (/minutes or less/.test(msg)) return msg;
  if (/credit|billing|402/.test(msg)) return "Your Anthropic account seems to be out of credit.";
  if (/overloaded|529|rate/i.test(msg)) return "Claude is busy right now. Wait a moment and try again.";
  return "Try again. If it keeps failing, share the technical details with Claude Code.";
}
