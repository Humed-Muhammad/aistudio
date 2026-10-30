import { Audio, Video } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { kitFor } from "../graphicKits";
import { MediaBase, useMedia } from "../media";
import { Backdrop } from "../film/Backdrop";
import { SceneView } from "../film/Film";
import { DEFAULT_FILM } from "../film/Preview";
import type { BackdropName, Film, SoundFile } from "../film/types";

// A faceless YouTube video from the Channel tool (channel_render.py): the ElevenLabs voice-over from start to end,
// and over it one shot after another, each timed to its words: stock footage or an AI clip with a slow camera move, an
// AI image panned slowly (Ken Burns), a Motion Studio scene template for numbers, lists and comparisons, a chapter
// card, or (while a shot still has no footage) the narration's words. Shots cross-fade; a music bed sits under it all.

export type FacelessShot = {
  id: string;
  kind: "video" | "image" | "graphic" | "chapter" | "text";
  from: number;
  frames: number;
  motion: "push" | "pull" | "left" | "right" | "still";
  /** Frames into the shot where this render starts (a short cut from the middle of a shot). */
  offset: number;
  file?: string;
  /** Seconds of footage the file has (a shorter clip is slowed down a little, then holds). */
  seconds?: number | null;
  template?: string;
  props?: Film["scenes"][number]["props"];
  title?: string;
  number?: number;
  text?: string;
};

export type FacelessProps = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  /** Video folder URL in the browser preview; empty when rendering (the folder is the public dir). */
  base?: string | null;
  voice: string;
  /** Frame of the voice-over this render starts at (shorts start mid-video). */
  voiceFrom: number;
  music: string | null;
  musicVolume: number;
  style: string;
  mode: "dark" | "light";
  accent: string;
  accent2: string;
  backdrop: BackdropName;
  shots: FacelessShot[];
  sounds: Partial<Record<"whoosh" | "pop", SoundFile>>;
  captions: null;
};

const FADE = 8;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A slow camera move over footage or a still, so no frame is ever quite static. */
const Move: React.FC<{
  motion: FacelessShot["motion"];
  frames: number;
  offset: number;
  children: React.ReactNode;
}> = ({ motion, frames, offset, children }) => {
  const f = useCurrentFrame() + offset;
  const p = interpolate(f, [0, Math.max(1, frames + offset)], [0, 1], clamp);
  const style: React.CSSProperties =
    motion === "push"
      ? { scale: 1.02 + p * 0.07 }
      : motion === "pull"
        ? { scale: 1.09 - p * 0.07 }
        : motion === "left"
          ? { scale: 1.1, translate: `${2.5 - p * 5}% 0` }
          : motion === "right"
            ? { scale: 1.1, translate: `${-2.5 + p * 5}% 0` }
            : {};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const Footage: React.FC<{ shot: FacelessShot; fps: number }> = ({ shot, fps }) => {
  const media = useMedia();
  const need = (shot.frames + shot.offset) / fps;
  // Too-short clips play a little slower (never below 0.7×); the last frame then holds.
  const rate = shot.seconds && shot.seconds < need ? Math.max(0.7, shot.seconds / need) : 1;
  return (
    <Move motion={shot.motion} frames={shot.frames} offset={shot.offset}>
      <Video src={media(shot.file!)} muted playbackRate={rate} trimBefore={Math.round(shot.offset * rate)} objectFit="cover" style={{ width: "100%", height: "100%" }} />
    </Move>
  );
};

const Still: React.FC<{ shot: FacelessShot }> = ({ shot }) => {
  const media = useMedia();
  return (
    <Move motion={shot.motion === "still" ? "push" : shot.motion} frames={shot.frames} offset={shot.offset}>
      <Img src={media(shot.file!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Move>
  );
};

const filmOf = (p: FacelessProps, shot: FacelessShot): Film => ({
  ...DEFAULT_FILM,
  format: p.width >= p.height ? "landscape" : "portrait",
  style: p.style,
  mode: p.mode,
  accent: p.accent,
  accent2: p.accent2,
  backdrop: p.backdrop,
  camera: "still",
  transition: "cut",
  language: "en",
  scenes: [
    {
      id: shot.id,
      template: shot.template ?? "title-card",
      duration: shot.frames / p.fps,
      props: shot.props ?? {},
    },
  ],
});

const Ground: React.FC<{ p: FacelessProps }> = ({ p }) => <Backdrop name={p.backdrop} kit={kitFor(p.style)} mode={p.mode} accent={p.accent} accent2={p.accent2} />;

/** Chapter card: the number small, the title large, in the channel's graphic style. */
const Chapter: React.FC<{ shot: FacelessShot; p: FacelessProps }> = ({ shot, p }) => {
  const frame = useCurrentFrame() + shot.offset;
  const theme = kitFor(p.style)[p.mode];
  const k = Math.min(p.width, p.height) / 1080;
  const rise = (d: number) => ({
    opacity: interpolate(frame, [d, d + 12], [0, 1], clamp),
    translate: `0 ${interpolate(frame, [d, d + 16], [30 * k, 0], clamp)}px`,
  });
  const bar = interpolate(frame, [4, 26], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Ground p={p} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: `0 ${p.width > p.height ? 160 * k : 80 * k}px`,
          gap: 26 * k,
        }}
      >
        <div
          style={{
            ...rise(2),
            fontFamily: theme.body,
            fontWeight: 700,
            fontSize: 34 * k,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: p.accent,
          }}
        >
          Chapter {shot.number ?? ""}
        </div>
        <div
          style={{
            height: 6 * k,
            width: 180 * k * bar,
            background: p.accent,
            borderRadius: 3 * k,
          }}
        />
        <div
          style={{
            ...rise(8),
            fontFamily: theme.head,
            fontWeight: theme.headWeight,
            fontSize: (p.width > p.height ? 96 : 84) * k * Math.min(1.15, theme.type),
            lineHeight: 1.05,
            letterSpacing: theme.tracking,
            textTransform: theme.upper ? "uppercase" : "none",
            color: theme.ink ?? theme.text,
            maxWidth: p.width > p.height ? "75%" : "100%",
          }}
        >
          {shot.title}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A shot that still has no footage: the words being said, large, word by word. */
const Words: React.FC<{ shot: FacelessShot; p: FacelessProps }> = ({ shot, p }) => {
  const frame = useCurrentFrame() + shot.offset;
  const theme = kitFor(p.style)[p.mode];
  const k = Math.min(p.width, p.height) / 1080;
  const words = (shot.text ?? "").split(/\s+/).filter(Boolean);
  const each = Math.max(2, (shot.frames + shot.offset) / Math.max(1, words.length));
  return (
    <AbsoluteFill>
      <Ground p={p} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: `0 ${120 * k}px`,
        }}
      >
        <div
          style={{
            fontFamily: theme.head,
            fontWeight: theme.headWeight,
            fontSize: 64 * k,
            lineHeight: 1.2,
            textAlign: "center",
            color: theme.ink ?? theme.text,
            maxWidth: 1500 * k,
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                opacity: interpolate(frame, [i * each, i * each + 6], [0.18, 1], clamp),
              }}
            >
              {w}{" "}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ShotView: React.FC<{ shot: FacelessShot; p: FacelessProps }> = ({ shot, p }) => {
  if (shot.kind === "video" && shot.file) return <Footage shot={shot} fps={p.fps} />;
  if (shot.kind === "image" && shot.file) return <Still shot={shot} />;
  if (shot.kind === "chapter") return <Chapter shot={shot} p={p} />;
  if (shot.kind === "graphic") {
    const film = filmOf(p, shot);
    return (
      <AbsoluteFill>
        <Ground p={p} />
        <Sequence from={-shot.offset}>
          <SceneView film={film} scene={film.scenes[0]} index={0} frames={shot.frames + shot.offset} />
        </Sequence>
      </AbsoluteFill>
    );
  }
  return <Words shot={shot} p={p} />;
};

/** Every shot fades in over the one before it (the first starts at once); each stays FADE frames longer to be faded over. */
const Shots: React.FC<{ p: FacelessProps }> = ({ p }) => (
  <>
    {p.shots.map((shot, i) => (
      <Sequence key={shot.id} from={shot.from} durationInFrames={shot.frames + (i < p.shots.length - 1 ? FADE : 0)} premountFor={p.fps}>
        <Fade on={i > 0}>
          <ShotView shot={shot} p={p} />
        </Fade>
      </Sequence>
    ))}
  </>
);

const Fade: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: on ? interpolate(frame, [0, FADE], [0, 1], clamp) : 1 }}>{children}</AbsoluteFill>;
};

/** Voice from start to end, the music bed under it (in over 1 s, out over the last 3 s), a whoosh into each chapter and a pop on graphics. */
const Sound: React.FC<{ p: FacelessProps }> = ({ p }) => {
  const media = useMedia();
  const { fps, durationInFrames } = useVideoConfig();
  const cues = p.shots.flatMap((s, i) =>
    i === 0 || s.offset ? [] : s.kind === "chapter" ? [{ at: s.from, s: p.sounds.whoosh }] : s.kind === "graphic" ? [{ at: s.from + 4, s: p.sounds.pop }] : [],
  );
  return (
    <>
      <Audio src={media(p.voice)} trimBefore={p.voiceFrom || undefined} />
      {p.music ? (
        <Audio src={media(p.music)} loop volume={(f) => p.musicVolume * interpolate(f, [0, fps, durationInFrames - 3 * fps, durationInFrames], [0, 1, 1, 0], clamp)} />
      ) : null}
      {cues.map((c, i) =>
        c.s ? (
          <Sequence key={i} from={Math.max(0, c.at - Math.round(c.s.peak * fps))}>
            <Audio src={media(c.s.file)} volume={c.s.gain} />
          </Sequence>
        ) : null,
      )}
    </>
  );
};

export const Faceless: React.FC<FacelessProps> = (p) => (
  <MediaBase.Provider value={p.base ?? null}>
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Shots p={p} />
      <Sound p={p} />
    </AbsoluteFill>
  </MediaBase.Provider>
);

export const facelessDefaults: FacelessProps = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 90,
  base: null,
  voice: "voice.wav",
  voiceFrom: 0,
  music: null,
  musicVolume: 0.12,
  style: "glass",
  mode: "dark",
  accent: "#6EC1FF",
  accent2: "#B79CFF",
  backdrop: "aurora",
  shots: [
    {
      id: "c1",
      kind: "chapter",
      from: 0,
      frames: 90,
      motion: "still",
      offset: 0,
      title: "Chapter title",
      number: 1,
    },
  ],
  sounds: {},
  captions: null,
};
