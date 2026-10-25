import { SceneAlone } from "./Film";
import { SCENES } from "./registry.gen";
import type { Film, FilmProps } from "./types";

// One scene template on its own: library thumbnails in the studio and review stills (films.py check).

export const DEFAULT_FILM: Film = {
  version: 1,
  title: "",
  format: "portrait",
  style: "glass",
  mode: "dark",
  accent: "#6EC1FF",
  accent2: "#B79CFF",
  backdrop: "aurora",
  // eslint-disable-next-line @remotion/non-pure-animation -- a film setting (the hand-over between scenes), not a CSS transition
  transition: "push",
  camera: "drift",
  brand: { name: "Nimbo", logo: "" },
  language: "en",
  sound: { auto: true, music: "", music_volume: 0.5, voice: "" },
  scenes: [],
};

export type ScenePreviewProps = { id: string; film?: Partial<Film>; props?: Record<string, unknown> };

export const ScenePreview: React.FC<ScenePreviewProps> = ({ id, film, props }) => {
  const meta = SCENES[id]?.meta;
  if (!meta) return null;
  const f: Film = { ...DEFAULT_FILM, ...film, scenes: [{ id: "s1", template: id, duration: meta.duration, props: (props ?? {}) as Film["scenes"][0]["props"] }] };
  return <SceneAlone film={f} index={0} />;
};

/** One scene of a real film (its own values, style and backdrop): review stills of a job. */
export const FilmScene: React.FC<FilmProps & { index: number }> = ({ film, index }) => <SceneAlone film={film} index={index} />;
