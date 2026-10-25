import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import {
  BackLight,
  Backdrop,
  DEFAULT_LOOK,
  Finish,
  footageStyle,
  gradeFilter,
  liftFilter,
  needsSubject,
  Subject,
  Vignette,
} from "./Background";
import { Broll } from "./Broll";
import { LookSwitch } from "./LookSwitch";
import { TransitionLight, transitionMotion } from "./Transitions";
import { Captions } from "./Captions";
import { Card } from "./Cards";
import { ElementLayer } from "./elements/ElementLayer";
import { Sticker, TextPop } from "./Graphics";
import { MediaBase, useMedia } from "./media";
import { faceAt, reframeFor } from "./tracking";
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

export const Shorts: React.FC<ShortsProps> = (props) => (
  <MediaBase.Provider value={props.base ?? null}>
    <Edit {...props} />
  </MediaBase.Provider>
);

const Edit: React.FC<ShortsProps> = ({
  video,
  foreground,
  captions,
  tracks,
  plan,
  clips = {},
  assets = [],
  looks = {},
  voice = null,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const camera = useCamera(plan.events, tracks);
  const media = useMedia();
  // Every sound is copied into the job's sfx/ folder by shorts.py (the creator's pack or cached recordings).
  const sound = (name: string) => media(`sfx/${name}.wav`);
  const look = { ...DEFAULT_LOOK, ...plan.background };
  const transition = plan.transition ?? "bloom";
  const fx = transitionMotion(plan.events, transition, frame, fps, width / 1080);
  const subject = foreground && needsSubject(look) ? foreground : null;
  const k = width / 1080;
  const reframe = useMemo(
    () => reframeFor(tracks, look.reframe),
    [tracks, look.reframe],
  );
  const behind = plan.events.filter(
    (e) => e.type === "text" && e.behind_subject,
  );
  const front = plan.events.filter(
    (e) => e.type === "text" && !e.behind_subject,
  );
  const stickers = plan.events.filter((e) => e.type === "sticker");
  const onHand = plan.events.filter((e) => e.type === "element" && e.anchor === "hand");
  const switches = plan.events
    .filter((e) => e.type === "look" && e.look && looks[e.look])
    .sort((a, b) => a.start - b.start);

  const outer: React.CSSProperties = {
    transformOrigin: `${reframe.ox * 100}% ${reframe.oy * 100}%`,
    scale: reframe.s,
    translate: `${reframe.tx * width}px ${reframe.ty * height}px`,
    filter: gradeFilter(look),
  };
  const inner: React.CSSProperties = {
    transformOrigin: `${camera.origin[0] * 100}% ${camera.origin[1] * 100}%`,
    scale: camera.scale * (fx.scale ?? 1),
    translate: `${camera.dx + (fx.x ?? 0) * width}px ${camera.dy}px`,
    filter: fx.filter,
  };
  // The person, framed exactly as the picture, drawn again over a graphic placed "behind me".
  const person = (from: number) => (
    <AbsoluteFill style={outer}>
      <AbsoluteFill style={inner}>
        {subject ? (
          <Subject bg={look} foreground={subject} trimBefore={from} />
        ) : (
          <OffthreadVideo src={media(foreground!)} muted transparent trimBefore={from} style={{ filter: liftFilter(look) }} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      {/* Steady chest-up reframe and grade around the whole picture; the camera moves inside it. */}
      <AbsoluteFill style={outer}>
        <AbsoluteFill style={inner}>
          {video ? (
            <Video
              src={media(video)}
              muted={!!voice}
              style={footageStyle(look, k, !!subject)}
            />
          ) : null}
          {subject ? <Backdrop bg={look} tracks={tracks} reframe={reframe} /> : null}
          {subject ? <BackLight bg={look} tracks={tracks} /> : null}
          {behind.map((e, i) => {
            const { from, duration } = frames(e, fps);
            return (
              <Sequence
                key={`b${i}`}
                from={from}
                durationInFrames={duration}
                layout="none"
              >
                <TextPop
                  event={e}
                  duration={duration}
                  accent={plan.highlight_color}
                  style={plan.graphics_style}
                />
              </Sequence>
            );
          })}
          {subject ? <Subject bg={look} foreground={subject} /> : null}
          {video
            ? switches.map((e, i) => {
                const { from, duration } = frames(e, fps);
                // Back to back with the next switch: hold this look under the next one's fade-in, so the
                // real room never shows through between them.
                const next = switches[i + 1];
                const handoff = !!next && Math.abs(next.start - e.end) < 0.1;
                const hold = handoff ? Math.round(0.4 * fps) : 0;
                return (
                  <Sequence
                    key={`lk${i}`}
                    from={from}
                    durationInFrames={duration + hold}
                  >
                    <LookSwitch
                      look={{ ...looks[e.look!], lift: look.lift }}
                      video={video}
                      foreground={foreground}
                      tracks={tracks}
                      reframe={reframe}
                      from={from}
                      duration={duration + hold}
                      k={k}
                      fadeOut={!handoff}
                    />
                  </Sequence>
                );
              })
            : null}
          {foreground && !subject
            ? behind.map((e, i) => {
                // Person cutout over the text, only while behind-subject text is on screen.
                const { from, duration } = frames(e, fps);
                return (
                  <Sequence
                    key={`f${i}`}
                    from={from}
                    durationInFrames={duration}
                  >
                    <OffthreadVideo
                      src={media(foreground)}
                      muted
                      transparent
                      trimBefore={from}
                    />
                  </Sequence>
                );
              })
            : null}
          <Vignette bg={look} />
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
      </AbsoluteFill>
      <Finish bg={look} />

      {video
        ? plan.events
            .filter((e) => e.type === "broll" && clips[e.asset])
            .map((e, i) => {
              const { from, duration } = frames(e, fps);
              return (
                <Sequence
                  key={`br${i}`}
                  from={from}
                  durationInFrames={duration}
                >
                  <Broll
                    event={e}
                    clip={clips[e.asset]}
                    from={from}
                    duration={duration}
                    video={video}
                    foreground={foreground}
                    tracks={tracks}
                  />
                </Sequence>
              );
            })
        : null}

      {plan.events
        .filter((e) => e.type === "card")
        .map((e, i) => {
          const { from, duration } = frames(e, fps);
          // A card "behind me": the person, framed exactly as below, is drawn again over it while it shows.
          const tucked = e.behind_subject && e.scene === "overlay" && !!foreground;
          return (
            <Sequence key={`c${i}`} from={from} durationInFrames={duration}>
              <Card
                event={e}
                duration={duration}
                accent={plan.highlight_color}
                from={from}
                video={video}
                tracks={tracks}
                assets={assets}
                style={plan.graphics_style}
              />
              {tucked ? person(from) : null}
            </Sequence>
          );
        })}

      {plan.events
        .filter((e) => e.type === "element" && e.anchor !== "hand")
        .map((e, i) => {
          const { from, duration } = frames(e, fps);
          return (
            <Sequence key={`el${i}`} from={from} durationInFrames={duration} layout="none">
              <ElementLayer event={e} duration={duration} accent={plan.highlight_color} style={plan.graphics_style} />
              {e.behind_subject && foreground ? person(from) : null}
            </Sequence>
          );
        })}

      {/* Graphics riding on a hand: framed like the picture, and above the person drawn again for "behind me" graphics. */}
      {onHand.length ? (
        <AbsoluteFill style={{ ...outer, filter: undefined }}>
          <AbsoluteFill style={inner}>
            {onHand.map((e, i) => {
              const { from, duration } = frames(e, fps);
              return (
                <Sequence key={`eh${i}`} from={from} durationInFrames={duration} layout="none">
                  <ElementLayer event={e} duration={duration} accent={plan.highlight_color} style={plan.graphics_style} tracks={tracks} from={from} />
                </Sequence>
              );
            })}
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      <Captions
        captions={captions}
        plan={plan}
        tracks={tracks}
        reframe={reframe}
      />

      {front.map((e, i) => {
        const { from, duration } = frames(e, fps);
        return (
          <Sequence
            key={`t${i}`}
            from={from}
            durationInFrames={duration}
            layout="none"
          >
            <TextPop
              event={e}
              duration={duration}
              accent={plan.highlight_color}
              style={plan.graphics_style}
            />
          </Sequence>
        );
      })}

      <TransitionLight
        events={plan.events}
        kind={transition}
        frame={frame}
        fps={fps}
      />

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

      {voice ? <Audio src={media(voice)} /> : null}
      {plan.events
        .filter((e) => e.type === "sfx")
        .map((e, i) => (
          <Sequence key={`a${i}`} from={frames(e, fps).from}>
            <Audio src={sound(e.sound)} volume={e.volume} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
