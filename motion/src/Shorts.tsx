import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { Captions } from "./Captions";
import { Sticker, TextPop } from "./Graphics";
import { faceAt } from "./tracking";
import type { ShortEvent, ShortsProps } from "./types";

const RAMP = 7; // zoom in/out frames

const frames = (e: ShortEvent, fps: number) => {
  const from = Math.round(e.start * fps);
  return { from, duration: Math.max(1, Math.round(e.end * fps) - from) };
};

/** Combined punch-in zoom and shake for the current frame. */
const useCamera = (events: ShortEvent[], tracks: ShortsProps["tracks"]) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  let scale = 1;
  let origin: [number, number] = [0.5, 0.45];
  let dx = 0;
  let dy = 0;
  for (const e of events) {
    const { from, duration } = frames(e, fps);
    if (frame < from || frame > from + duration + RAMP) continue;
    if (e.type === "zoom") {
      const inn = spring({
        frame: frame - from,
        fps,
        config: { damping: 200 },
        durationInFrames: RAMP,
      });
      const out = interpolate(
        frame,
        [from + duration, from + duration + RAMP],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        },
      );
      scale *= 1 + (e.scale - 1) * inn * (1 - out);
      if (e.focus === "face") origin = faceAt(tracks, from);
    } else if (e.type === "shake" && frame <= from + duration) {
      const decay = 1 - (frame - from) / duration;
      dx +=
        (random(`x${frame}`) - 0.5) * 36 * e.intensity * decay * (width / 1080);
      dy +=
        (random(`y${frame}`) - 0.5) * 36 * e.intensity * decay * (width / 1080);
      scale *= 1.04;
    }
  }
  return { scale, origin, dx, dy };
};

const SOUND = (name: string) =>
  name === "pop"
    ? staticFile("sfx-pop.wav")
    : `https://remotion.media/${name}.wav`;

export const Shorts: React.FC<ShortsProps> = ({
  video,
  foreground,
  captions,
  tracks,
  plan,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const camera = useCamera(plan.events, tracks);
  const behind = plan.events.filter(
    (e) => e.type === "text" && e.behind_subject,
  );
  const front = plan.events.filter(
    (e) => e.type === "text" && !e.behind_subject,
  );
  const stickers = plan.events.filter((e) => e.type === "sticker");

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transformOrigin: `${camera.origin[0] * 100}% ${camera.origin[1] * 100}%`,
          scale: camera.scale,
          translate: `${camera.dx}px ${camera.dy}px`,
        }}
      >
        {video ? <Video src={staticFile(video)} /> : null}
        {behind.map((e, i) => {
          const { from, duration } = frames(e, fps);
          return (
            <Sequence
              key={`b${i}`}
              from={from}
              durationInFrames={duration}
              layout="none"
            >
              <TextPop event={e} duration={duration} />
            </Sequence>
          );
        })}
        {foreground
          ? behind.map((e, i) => {
              // Person cutout over the text, only while behind-subject text is on screen.
              const { from, duration } = frames(e, fps);
              return (
                <Sequence key={`f${i}`} from={from} durationInFrames={duration}>
                  <OffthreadVideo
                    src={staticFile(foreground)}
                    muted
                    transparent
                    trimBefore={from}
                  />
                </Sequence>
              );
            })
          : null}
        {stickers.map((e, i) => {
          const { from, duration } = frames(e, fps);
          return (
            <Sequence
              key={`s${i}`}
              from={from}
              durationInFrames={duration}
              layout="none"
            >
              <Sticker
                event={e}
                tracks={tracks}
                from={from}
                duration={duration}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      <Captions captions={captions} plan={plan} />

      {front.map((e, i) => {
        const { from, duration } = frames(e, fps);
        return (
          <Sequence
            key={`t${i}`}
            from={from}
            durationInFrames={duration}
            layout="none"
          >
            <TextPop event={e} duration={duration} />
          </Sequence>
        );
      })}

      {plan.events
        .filter((e) => e.type === "flash")
        .map((e, i) => {
          const { from } = frames(e, fps);
          return (
            <Sequence key={`fl${i}`} from={from} durationInFrames={10}>
              <AbsoluteFill
                style={{
                  backgroundColor: "white",
                  opacity: interpolate(frame - from, [0, 2, 9], [0, 0.85, 0], {
                    extrapolateRight: "clamp",
                  }),
                }}
              />
            </Sequence>
          );
        })}

      {plan.progress_bar ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 10 * (width / 1080),
            width: `${(frame / durationInFrames) * 100}%`,
            background: plan.highlight_color,
          }}
        />
      ) : null}

      {plan.events
        .filter((e) => e.type === "sfx")
        .map((e, i) => (
          <Sequence key={`a${i}`} from={frames(e, fps).from}>
            <Audio src={SOUND(e.sound)} volume={e.volume} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
