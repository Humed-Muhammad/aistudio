import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { Component as ReactComponent, type ReactNode } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { kitFor } from "../graphicKits";
import { MediaBase, useMedia } from "../media";
import { Backdrop } from "./Backdrop";
import { beat, SceneClock, useDrift } from "./motion";
import { SCENES } from "./registry.gen";
import { FRAMES, presentation, timing } from "./transitions";
import type { Cue, Film as FilmData, FilmProps, Scene, SceneEntry, SceneProps, SoundName, TransitionName, Values } from "./types";
import { World, WORLD_FRAMES } from "./World";

// A whole film: the backdrop, every scene in order with its hand-over to the next (or one camera flight through a
// 3D world), music, the creator's voice-over and sound effects placed on the motion.

/** Field defaults with the scene's own values on top. */
export const sceneValues = (entry: SceneEntry, props?: Record<string, unknown>): Values => {
  const v: Values = {};
  for (const f of entry.meta.fields) v[f.key] = (props?.[f.key] as Values[string] | undefined) ?? f.default;
  return v;
};

/** A scene that throws (an odd value typed into a field) draws nothing instead of breaking the film. */
class Guard extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const shapeOf = (width: number, height: number): SceneProps["shape"] => (height / width > 1.15 ? "tall" : width / height > 1.15 ? "wide" : "square");

/** The hand-over after scene i (none after the last). */
export const handover = (film: FilmData, i: number): TransitionName => {
  if (i >= film.scenes.length - 1) return "cut";
  return (film.scenes[i].transition || film.transition) as TransitionName;
};

/** Frames of overlap between scene i and the next. */
export const overlap = (film: FilmData, i: number) => (i >= film.scenes.length - 1 ? 0 : film.camera === "world" ? WORLD_FRAMES : FRAMES[handover(film, i)]);

/** Where every scene starts and how long it runs, in frames. */
export const timeline = (film: FilmData, fps: number) => {
  let at = 0;
  return film.scenes.map((s, i) => {
    const frames = Math.max(1, Math.round(s.duration * fps));
    const row = { scene: s, from: at, frames, index: i };
    at += frames - overlap(film, i);
    return row;
  });
};
export const filmFrames = (film: FilmData, fps: number) => {
  const rows = timeline(film, fps);
  return rows.length ? rows[rows.length - 1].from + rows[rows.length - 1].frames : fps;
};

/** One scene drawn with its values, style and clock. */
export const SceneView: React.FC<{ film: FilmData; scene: Scene; index: number; frames: number; drift?: boolean }> = ({ film, scene, index, frames, drift }) => {
  const { width, height } = useVideoConfig();
  const entry = SCENES[scene.template];
  if (!entry) return null;
  const kit = kitFor(film.style);
  const mode = scene.mode || film.mode;
  const k = Math.min(width, height) / 1080;
  const out = handover(film, index);
  const exits = film.camera !== "world" && index < film.scenes.length - 1 && (out === "cut" || out === "fade");
  const props: SceneProps = {
    v: sceneValues(entry, scene.props),
    theme: kit[mode],
    kit,
    accent: scene.accent || film.accent,
    accent2: film.accent2,
    durationInFrames: frames,
    width,
    height,
    k,
    shape: shapeOf(width, height),
    brand: film.brand,
    exits,
  };
  const { Component } = entry;
  return (
    <SceneClock.Provider value={{ durationInFrames: frames, exits, k }}>
      <Drift on={!!drift}>
        <Guard>
          <Component {...props} />
        </Guard>
      </Drift>
    </SceneClock.Provider>
  );
};

/** A slow push-in over the scene: the frame is never quite still. */
const Drift: React.FC<{ on: boolean; children: ReactNode }> = ({ on, children }) => {
  const p = useDrift(1);
  return <AbsoluteFill style={on ? { scale: 1 + p * 0.035 } : undefined}>{children}</AbsoluteFill>;
};

export const Film: React.FC<FilmProps> = (props) => (
  <MediaBase.Provider value={props.base ?? null}>
    <Body {...props} />
  </MediaBase.Provider>
);

const Body: React.FC<FilmProps> = ({ film, sounds, fps }) => {
  const { width, height } = useVideoConfig();
  const kit = kitFor(film.style);
  const tall = shapeOf(width, height) === "tall";
  const rows = timeline(film, fps);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {film.camera === "world" ? (
        <World film={film} rows={rows} />
      ) : (
        <>
          <Backdrop name={film.backdrop} kit={kit} mode={film.mode} accent={film.accent} accent2={film.accent2} />
          <TransitionSeries>
            {rows.flatMap(({ scene, frames, index }) => {
              const out = handover(film, index);
              const items = [
                <TransitionSeries.Sequence key={scene.id} durationInFrames={frames} premountFor={fps}>
                  <SceneView film={film} scene={scene} index={index} frames={frames} drift={film.camera === "drift"} />
                </TransitionSeries.Sequence>,
              ];
              if (index < rows.length - 1 && out !== "cut")
                items.push(<TransitionSeries.Transition key={scene.id + "-t"} timing={timing(out)} presentation={presentation(out, tall)} />);
              return items;
            })}
          </TransitionSeries>
        </>
      )}
      <Sound film={film} rows={rows} sounds={sounds} />
    </AbsoluteFill>
  );
};

/** The sound each hand-over makes: movement whooshes, fades and cuts stay quiet. */
const TRANSITION_SOUND: Record<TransitionName, SoundName | null> = { push: "whoosh", slide: "whoosh", zoom: "whoosh", blur: "whoosh", whip: "whoosh", wipe: "whoosh", iris: "whoosh", flip: "whoosh", fade: null, cut: null };
/** Shortest gap between two sounds of one family, in seconds (sparse, never a machine gun). */
const GAP_S: Partial<Record<SoundName, number>> = { whoosh: 0.9, impact: 4, riser: 8, hit: 4, success: 1.5 };

/** Every sound cue in the film, in frames, thinned so families never crowd each other. */
export const filmCues = (film: FilmData, rows: ReturnType<typeof timeline>, fps: number): Cue[] => {
  const all: Cue[] = [];
  rows.forEach(({ scene, from, frames, index }) => {
    const entry = SCENES[scene.template];
    if (!entry) return;
    if (index > 0) {
      const into = film.camera === "world" ? "whoosh" : TRANSITION_SOUND[handover(film, index - 1)];
      const span = film.camera === "world" ? WORLD_FRAMES : FRAMES[handover(film, index - 1)];
      if (into) all.push({ frame: from + Math.round(span / 2), sound: into });
    }
    const own = entry.cues ? entry.cues(sceneValues(entry, scene.props), frames, fps) : entry.meta.sound !== "none" ? [{ frame: beat(0) + 2, sound: entry.meta.sound }] : [];
    for (const c of own) if (c.frame >= 0 && c.frame < frames) all.push({ frame: from + c.frame, sound: c.sound });
  });
  all.sort((a, b) => a.frame - b.frame);
  const kept: Cue[] = [];
  const last: Partial<Record<SoundName, number>> = {};
  for (const c of all) {
    if (kept.some((o) => Math.abs(o.frame - c.frame) < fps * 0.12)) continue;
    if (c.frame - (last[c.sound] ?? -1e9) < (GAP_S[c.sound] ?? 0.15) * fps) continue;
    last[c.sound] = c.frame;
    kept.push(c);
  }
  return kept;
};

const Sound: React.FC<{ film: FilmData; rows: ReturnType<typeof timeline>; sounds: FilmProps["sounds"] }> = ({ film, rows, sounds }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const media = useMedia();
  const voice = film.sound.voice;
  const music = film.sound.music;
  const cues = film.sound.auto ? filmCues(film, rows, fps) : [];
  // Music sits under the voice when there is one; it fades in over a second and out over the last two.
  const bed = Math.max(0, Math.min(1, film.sound.music_volume)) * (voice ? 0.4 : 1);
  return (
    <>
      {music ? (
        <Audio
          src={media(music)}
          loop
          volume={(f) => bed * interpolate(f, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      ) : null}
      {voice ? <Audio src={media(voice)} /> : null}
      {cues.map((c, i) => {
        const s = sounds[c.sound];
        if (!s) return null;
        const from = c.frame - Math.round(s.peak * fps);
        return (
          <Sequence key={i} from={Math.max(0, from)}>
            <Audio src={media(s.file)} volume={s.gain} trimBefore={from < 0 ? -from : undefined} />
          </Sequence>
        );
      })}
    </>
  );
};

/** Frame at which scene i starts (the editor seeks here when a scene is picked). */
export const sceneStart = (film: FilmData, index: number, fps: number) => timeline(film, fps)[index]?.from ?? 0;

/** The film's current scene at a frame (the last one that has started). */
export const sceneAt = (film: FilmData, frame: number, fps: number) => {
  const rows = timeline(film, fps);
  let at = 0;
  rows.forEach((r, i) => {
    if (frame >= r.from) at = i;
  });
  return at;
};

/** Plays one scene alone on the film's backdrop (library thumbnails, review stills). */
export const SceneAlone: React.FC<{ film: FilmData; index: number }> = ({ film, index }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const scene = film.scenes[index];
  if (!scene) return null;
  const frames = Math.max(1, Math.round(scene.duration * fps));
  const kit = kitFor(film.style);
  return (
    <AbsoluteFill>
      <Backdrop name={film.backdrop} kit={kit} mode={scene.mode || film.mode} accent={scene.accent || film.accent} accent2={film.accent2} />
      {frame < frames ? <SceneView film={{ ...film, scenes: [scene], camera: film.camera === "world" ? "still" : film.camera }} scene={scene} index={0} frames={frames} /> : null}
    </AbsoluteFill>
  );
};
