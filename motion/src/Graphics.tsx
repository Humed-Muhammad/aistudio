import { useMemo } from "react";
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { HEADLINE_FONT } from "./Captions";
import { faceAt, findTrigger, follow } from "./tracking";
import type { ShortEvent, Tracks } from "./types";

const EXIT = 6;

const exitScale = (frame: number, duration: number) =>
  interpolate(frame, [duration - EXIT, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** Headline pop. Rendered inside a Sequence, so frame 0 is the event start. */
export const TextPop: React.FC<{ event: ShortEvent; duration: number }> = ({
  event,
  duration,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = width / 1080;
  const enter = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 180 },
    durationInFrames: 12,
  });
  const shown =
    event.style === "type"
      ? event.text.slice(
          0,
          Math.ceil(
            interpolate(
              frame,
              [0, Math.max(6, event.text.length * 1.5)],
              [0, event.text.length],
              { extrapolateRight: "clamp" },
            ),
          ),
        )
      : event.text;
  return (
    <div
      style={{
        position: "absolute",
        left: `${event.x * 100}%`,
        top: `${event.y * 100}%`,
        translate:
          event.style === "slide"
            ? `calc(-50% + ${interpolate(enter, [0, 1], [-700 * k, 0])}px) -50%`
            : "-50% -50%",
        scale: (event.style === "pop" ? enter : 1) * exitScale(frame, duration),
        maxWidth: 920 * k,
        width: "max-content",
        textAlign: "center",
        fontFamily: HEADLINE_FONT,
        fontWeight: 900,
        fontSize: 96 * event.size * k,
        lineHeight: 1.05,
        textTransform: "uppercase",
        color: event.color,
        padding: event.background === "pill" ? `${14 * k}px ${34 * k}px` : 0,
        borderRadius: 999,
        background:
          event.background === "pill" ? "rgba(10,10,14,.82)" : "transparent",
        WebkitTextStroke:
          event.background === "pill" ? 0 : `${12 * k * event.size}px black`,
        paintOrder: "stroke fill",
        textShadow: `0 ${8 * k}px ${26 * k}px rgba(0,0,0,.5)`,
      }}
    >
      {shown}
    </div>
  );
};

/** Image or emoji that appears on cue and follows a hand, the face, or stays on screen. */
export const Sticker: React.FC<{
  event: ShortEvent;
  tracks: Tracks;
  from: number;
  duration: number;
}> = ({ event, tracks, from, duration }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const abs = from + frame;
  const trigger = useMemo(
    () => (event.anchor === "hand" ? findTrigger(tracks, event, fps) : null),
    [tracks, event, fps],
  );

  let x = event.x * width;
  let y = event.y * height;
  let w = event.size * width * 0.3;
  let visible = 1;
  let tilt = 0;
  let start = 0;

  if (event.anchor === "hand") {
    if (!trigger || abs < trigger.frame) return null;
    start = trigger.frame - from;
    const track = tracks.hands[trigger.side];
    const now = follow(track, abs);
    if (!now) return null;
    const [px, py, tx, ty, s] = now.sample;
    visible = now.visible;
    const handPx = s * height;
    if (event.point === "fingertip")
      [x, y] = [tx * width, ty * height - handPx * 0.25];
    else if (event.point === "palm") [x, y] = [px * width, py * height];
    else [x, y] = [px * width, py * height - handPx * 1.35];
    w = Math.max(event.size * handPx * 2.2, event.size * width * 0.14);
    const before = follow(track, abs - 2);
    if (before)
      tilt = Math.max(-18, Math.min(18, (px - before.sample[0]) * width * 0.6));
  } else if (event.anchor === "face") {
    const now = follow(tracks.face, abs);
    if (now) {
      const [fx, fy, fh] = now.sample;
      visible = now.visible;
      const facePx = fh * height;
      w = event.size * facePx * 1.4;
      [x, y] =
        event.point === "beside_face"
          ? [fx * width + facePx * 0.95, fy * height]
          : [fx * width, fy * height - facePx * 1.05];
    } else {
      const [fx, fy] = faceAt(tracks, abs);
      [x, y] = [fx * width, fy * height - height * 0.15];
    }
  }

  const t = frame - start;
  const enter = spring({
    frame: t,
    fps,
    config:
      event.animation === "pop"
        ? { damping: 9, stiffness: 200 }
        : { damping: 14 },
    durationInFrames: 16,
  });
  const idle =
    event.idle === "float"
      ? { translate: `0 ${Math.sin(t / 7) * w * 0.04}px` }
      : event.idle === "pulse"
        ? { scale: 1 + Math.sin(t / 5) * 0.05 }
        : event.idle === "spin"
          ? { rotate: `${t * 4}deg` }
          : {};
  const scale =
    (event.animation === "fade" ? 1 : enter) *
    exitScale(frame, duration) *
    ((idle as { scale?: number }).scale ?? 1);
  const rotate =
    (event.animation === "spin" ? interpolate(enter, [0, 1], [-200, 0]) : 0) +
    tilt;
  const drop =
    event.animation === "drop"
      ? interpolate(enter, [0, 1], [-height * 0.4, 0])
      : 0;
  const opacity =
    visible *
    (event.animation === "fade"
      ? interpolate(t, [0, 8], [0, 1], { extrapolateRight: "clamp" })
      : 1);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + drop,
        width: w,
        translate: "-50% -50%",
        opacity,
        scale,
        rotate: `${rotate}deg`,
        filter: `drop-shadow(0 ${w * 0.06}px ${w * 0.08}px rgba(0,0,0,.45))`,
      }}
    >
      <div style={{ ...idle, scale: undefined }}>
        {event.asset ? (
          <Img
            src={staticFile(`assets/${event.asset}`)}
            style={{ width: "100%", display: "block" }}
          />
        ) : (
          <div
            style={{ fontSize: w * 0.82, lineHeight: 1, textAlign: "center" }}
          >
            {event.emoji}
          </div>
        )}
      </div>
    </div>
  );
};
