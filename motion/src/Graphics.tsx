import { useMemo } from "react";
import {
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useMedia } from "./media";
import { onAccent } from "./colors";
import { Emoji } from "./Emoji";
import { accentCss, kitFor } from "./graphicKits";
import { faceAt, findTrigger, follow } from "./tracking";
import type { ShortEvent, Tracks } from "./types";

const EXIT = 6;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const exitScale = (frame: number, duration: number) =>
  interpolate(frame, [duration - EXIT, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/**
 * Text pop in the editorial style: clean sans words, *starred* words in the italic serif accent,
 * a soft halo instead of an outline. Rendered inside a Sequence, so frame 0 is the event start.
 */
export const TextPop: React.FC<{
  event: ShortEvent;
  duration: number;
  accent: string;
  /** Graphic style id (plan.graphics_style). */
  style?: string;
}> = ({ event, duration, accent, style }) => {
  const theme = kitFor(style).dark;
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const k = width / 1080;
  const enter = interpolate(frame, [0, 9], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const leave = interpolate(frame, [duration - EXIT, duration], [1, 0], clamp);
  const typed =
    event.style === "type"
      ? Math.ceil(
          interpolate(
            frame,
            [0, Math.max(6, event.text.length * 1.5)],
            [0, event.text.length],
            clamp,
          ),
        )
      : event.text.length;
  const size =
    80 * event.size * k * theme.type * (event.behind_subject ? 1.6 : 1);
  const colour = event.color.toUpperCase() === "#FFFFFF" ? accent : event.color;
  const halo = `0 0 ${20 * k}px rgba(0,0,0,.65), 0 ${3 * k}px ${8 * k}px rgba(0,0,0,.5)`;
  let shown = 0;
  const parts = event.text.split(/(\*[^*]+\*)/).filter(Boolean);
  const plain = parts.length === 1 && !parts[0].startsWith("*");
  // A pill is a solid accent badge with dark text and one light sweep as it lands.
  const badge = event.background === "pill";
  // The badge is the style's own surface (glass panel, black block, white outlined card…); a style with
  // no panels (minimal) falls back to a solid accent badge.
  const solid = theme.card === "transparent";
  const surface = solid ? accent : theme.card;
  const ink = badge ? (solid ? onAccent(accent) : theme.text) : "white";
  const sweep = interpolate(frame, [6, 22], [-30, 130], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: `${event.x * 100}%`,
        top: `${event.y * 100}%`,
        translate:
          event.style === "slide"
            ? `calc(-50% + ${(1 - enter) * -120 * k}px) -50%`
            : `-50% calc(-50% + ${(1 - enter) * 18 * k}px)`,
        opacity: enter * leave,
        filter: enter < 1 ? `blur(${(1 - enter) * 10 * k}px)` : undefined,
        maxWidth: 920 * k,
        width: "max-content",
        textAlign: "center",
        lineHeight: 1.05,
        padding: badge ? `${18 * k}px ${38 * k}px` : 0,
        borderRadius: 22 * k * theme.radius,
        overflow: badge ? "hidden" : undefined,
        background: badge
          ? `linear-gradient(105deg, transparent ${sweep - 18}%, rgba(255,255,255,.4) ${sweep}%, transparent ${sweep + 18}%), ${surface}`
          : "transparent",
        boxShadow: badge
          ? solid
            ? `0 ${14 * k}px ${34 * k}px rgba(0,0,0,.35)`
            : theme.shadow
          : undefined,
        border:
          badge && !solid
            ? `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`
            : undefined,
        backdropFilter: badge && !solid ? theme.blur : undefined,
      }}
    >
      {parts.map((p, i) => {
        const star = p.startsWith("*");
        const word = star ? p.slice(1, -1) : p;
        const visible = word.slice(0, Math.max(0, typed - shown));
        shown += p.length;
        const accented = star;
        return (
          <span
            key={i}
            style={{
              fontFamily: theme.head,
              fontWeight: theme.headWeight,
              letterSpacing: theme.tracking,
              textTransform: theme.upper ? "uppercase" : undefined,
              fontSize: size * (plain ? 1 : 0.8),
              color: badge ? ink : (event.ink || "white"),
              textShadow: badge ? "none" : halo,
              ...(accented && (!badge || !solid)
                ? accentCss(theme, colour, size * 0.8)
                : {}),
              ...(accented && !badge && theme.accent !== "glow"
                ? { textShadow: halo }
                : {}),
            }}
          >
            {visible}
          </span>
        );
      })}
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
  const media = useMedia();
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
    const now = follow(track, abs, 12); // bridge 0.4 s of lost tracking
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
            src={media(`assets/${event.asset}`)}
            style={{ width: "100%", display: "block" }}
          />
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Emoji emoji={event.emoji} size={w} />
          </div>
        )}
      </div>
    </div>
  );
};
