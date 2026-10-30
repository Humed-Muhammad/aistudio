/** Channel tool (channel.py): types for niche research, channel profiles and videos. */
export type TaskState = "idle" | "running" | "done" | "error" | "cancelled";

export type ChannelSetup = {
  claude: boolean;
  models: Record<string, string>;
  keys: { youtube: boolean; elevenlabs: boolean; pexels: boolean; pixabay: boolean; fal: boolean };
  styles: string[];
  quota: { used: number; daily: number };
  defaults: Profile;
  art_styles: Record<string, string>;
  prices: { image: number; ai_clip: number };
  backdrops: string[];
};

export type Profile = {
  id: string;
  name: string;
  niche: string;
  audience: string;
  tone: string;
  notes: string;
  voice: { id: string; name: string; model: string; delivery: string };
  look: { style: string; accent: string; accent2: string; mode: "dark" | "light"; backdrop: string; music: string; music_volume: number };
  art: { style: string; prompt: string; stock: boolean; mascot: { name: string; description: string; image: string } };
  minutes: number;
  ai_budget: number;
  upload: { privacy: "private" | "unlisted" | "public"; category: string; tags: string[]; made_for_kids: boolean };
  /** Competitor channels (@handles or links) the topic researcher watches. */
  competitors: string[];
  created?: number;
};

export type Niche = {
  name: string;
  verdict: "go" | "maybe" | "avoid";
  demand: number;
  competition: number;
  faceless_fit: number;
  rpm: string;
  policy_risk: "low" | "medium" | "high";
  why: string;
  angle: string;
  evidence: string[];
};
export type Topic = {
  title: string;
  niche: string;
  hook: string;
  why: string;
  based_on: string[];
  score: number;
  /** Topic research only: evergreen or trending, what it adds, its three points, why now, search phrases it answers, sources. */
  kind?: "evergreen" | "trending";
  angle?: string;
  points?: string[];
  why_now?: string;
  searches?: string[];
  links?: string[];
};
export type ScanVideo = {
  id: string;
  title: string;
  channel: string;
  channel_subs: number | null;
  channel_age_days: number | null;
  views: number;
  age_days: number;
  duration: number;
  outlier: number | null;
  views_per_sub: number | null;
  seeds: string[];
  thumb: string | null;
  url: string;
  competitor?: boolean;
};
export type SeedRow = {
  seed: string;
  videos: number;
  median_views?: number;
  top_views?: number;
  median_channel_subs?: number | null;
  channels?: number;
  top3_share?: number;
  small_channel_hits?: number;
  young_channel_hits?: number;
  outliers?: string[];
};
export type ResearchSummary = {
  id: string;
  kind: "niche" | "topics";
  focus: string;
  made: number;
  seeds: string[];
  created: number;
  profile: string | null;
  videos: number;
  units: number;
  skipped: string | null;
  niches: number;
  topics: number;
  best: string | null;
  state: TaskState;
  status: string;
  progress: number | null;
};
export type Research = ResearchSummary & {
  action: string | null;
  request: { seeds: string[]; months: number; searches: number; model: string; profile: string | null; focus?: string; competitors?: string[] } | null;
  result: { summary: string; niches: Niche[]; topics: Topic[]; model: string; written: number } | null;
  summary_rows: SeedRow[];
  videos: ScanVideo[];
  competitors: { id: string; title: string; subs: number | null; median_views: number | null; url: string }[];
  competitor_problems: string[];
  suggestions: Record<string, string[]>;
  /** Topic title → the channel video made from it. */
  made_videos: Record<string, string>;
};

export const big = (n: number | null | undefined) => (n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));

export type Paragraph = { id: string; text: string };
export type Section = { id: string; kind: "hook" | "intro" | "chapter" | "rehook" | "outro"; title: string; paragraphs: Paragraph[] };
export type Script = { title: string; sections: Section[] };
export type Word = { text: string; start: number; end: number; p: string; s: string };
export type Words = {
  duration: number;
  words: Word[];
  paragraphs: { id: string; section: string; start: number; end: number }[];
  sections: { id: string; title: string; kind: string; start: number; end: number }[];
};
export type VideoSummary = {
  id: string;
  title: string;
  topic: string;
  profile: string | null;
  created: number;
  minutes: number;
  duration: number | null;
  stage: string;
  thumb: string | null;
  updated: number;
  state: TaskState;
  status: string;
  progress: number | null;
  action: string | null;
};
export type ClaudeRun = { kind: string; model: string; summary: string; changes: string[]; warnings?: string[]; finished: number; undone?: boolean };
export type VideoState = VideoSummary & {
  job: { topic: string; hook: string; notes: string; minutes: number; research: string | null; approved: { time: number } | null };
  script: Script;
  stats: { words: number; minutes: number; chars: number; tags: number; sections: number; paragraphs: number };
  warnings: string[];
  sources: string;
  approved: boolean;
  voice: { paragraphs: number; todo: string[]; chars: number; credits: number; total_chars: number; total_credits: number; ready: boolean } | null;
  voiced: boolean;
  /** The voice-over was made with another voice, model or delivery than the channel has now. */
  voice_changed: { model: string; delivery: string; same_voice: boolean } | null;
  /** The channel's voice model performs [delivery tags] (Eleven v3/v4). */
  performs_tags: boolean;
  words: Words | null;
  files: Record<string, number>;
  can_undo: boolean;
  runs: ClaudeRun[];
};
export type ChatMessage = { role: "user" | "assistant"; text: string; time: number; changes?: string[]; error?: string; undone?: boolean; backup?: string | null };
export type ChatState = { messages: ChatMessage[]; claude: boolean; status: { state: TaskState; status: string; action?: string }; video: VideoState };

export const videoUrl = (id: string, path = "") => `/channel/videos/${id}${path ? "/" + path : ""}`;
export const mediaUrl = (id: string, name: string, version?: number) => `/runs/channel/videos/${id}/${name}${version ? "?v=" + version : ""}`;

export type Shot = {
  id: string;
  p: string;
  at: string;
  kind: "stock" | "graphic" | "image" | "ai_clip" | "chapter";
  query?: string;
  prompt?: string;
  template?: string;
  props?: Record<string, unknown>;
  title?: string;
  motion?: string;
  note?: string;
  mascot?: boolean;
  animate?: string;
  start: number;
  end: number;
  fallback?: boolean;
};
export type Candidate = { id: string; provider: string; thumb: string | null; page: string; credit: string; duration: number };
export type Visual = {
  key: string;
  kind: string;
  file: string;
  seconds: number | null;
  source_id?: string;
  provider: string;
  credit?: string;
  page?: string;
  query?: string;
  prompt?: string;
  candidates?: Candidate[];
};
export type ShotsState = {
  shots: Shot[];
  scenes_warnings: string[];
  visuals: Record<string, Visual>;
  footage_ready: boolean;
  costs: { todo: { id: string; kind: string; usd: number }[]; usd: number };
  budget: number;
  spent: number;
  gather: { missing: string[]; errors: string[]; ai_made: number; spent: number } | null;
  credits: string[];
};

export type MascotState = { profile: Profile; image: string | null; options: string[] };

export type Moment = {
  n: number;
  first: string;
  last: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  why: string;
  job: string | null;
  short: { id: string; stage: string; state: TaskState; status: string } | null;
  file: string | null;
};
export type Post = {
  title: string;
  titles: string[];
  summary: string;
  description: string;
  tags: string[];
  pinned_comment: string;
  thumb_texts: string[];
  best_time: string;
  synthetic: boolean;
  chapters: { time: string; title: string }[];
  thumb_error?: string;
};
export type Upload = {
  video_id: string;
  url: string;
  privacy: string;
  publish_at: string | null;
  uploaded: number;
  shorts?: Record<string, { video_id: string; url: string }>;
  warnings?: string[];
};
export type PublishState = {
  moments: Moment[];
  moment_warnings: string[];
  post: Post | null;
  thumbs: string[];
  chapters: { time: string; title: string }[];
  planner_available: boolean;
  upload: Upload | null;
};
export type YouTubeAccount = { client: boolean; connected: boolean; channel: string | null; login_url?: string | null };
