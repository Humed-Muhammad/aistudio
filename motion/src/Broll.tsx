import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useMedia } from "./media";
import { Video } from "@remotion/media";
import { Push } from "./Push";
import type { ClipInfo, ShortEvent, Tracks } from "./types";

const EXIT = 6;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Face centre and height at a frame, holding the last sighting within the shot. */
const faceBox = (tracks: Tracks, frame: number): [number, number, number] => {
  for (let back = 0; back < 45; back++) {
    const s = tracks.face[frame - back];
    if (s) return [s[0], s[1], s[2]];
    if (tracks.cuts.includes(frame - back)) break;
  }
  return [0.5, 0.38, 0.22];
};

type Props = {
  event: ShortEvent;
  clip: ClipInfo;
  from: number;
  duration: number;
  video: string;
  foreground: string | null;
  tracks: Tracks;
};

/**
 * Screen recording over the talking video. Rendered inside a Sequence, so frame 0 is the cut-in.
 * The speaker's audio keeps playing from the main video underneath; every video here is muted.
 */
export const Broll: React.FC<Props> = ({
  event,
  clip,
  from,
  duration,
  video,
  foreground,
  tracks,
}) => {
  const frame = useCurrentFrame();
  const media = useMedia();
  const { fps, width, height } = useVideoConfig();
  const k = width / 1080;
  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 9,
  });
  const fade = interpolate(frame, [duration - EXIT, duration], [1, 0], clamp);
  const vertical = clip.height >= clip.width;

  const screen = (fit: "cover" | "contain") => (
    <Video
      src={media(`assets/${event.asset}`)}
      muted
      trimBefore={Math.round(event.src_start * fps)}
      playbackRate={event.speed}
      objectFit={fit}
      style={{ width: "100%", height: "100%" }}
    />
  );
  // Speaker video at the same moment as underneath (muted: its sound already plays below).
  const speaker = (
    style: React.CSSProperties,
    fit: "cover" | "fill" = "cover",
  ) => (
    <Video
      src={media(video)}
      muted
      trimBefore={from}
      objectFit={fit}
      style={style}
    />
  );

  if (event.layout === "split" || event.layout === "full") {
    // The recording pushes the speaker out of the way (split: to the other half; full: off screen).
    return (
      <Push
        side={event.side}
        share={event.layout === "split" ? 0.55 : 1}
        duration={duration}
        from={from}
        video={video}
        tracks={tracks}
        accent="#ffffff"
      >
        <AbsoluteFill style={{ backgroundColor: "#0d0e12" }}>
          {screen(vertical ? "cover" : "contain")}
        </AbsoluteFill>
      </Push>
    );
  }

  const full = (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d0e12",
        opacity: enter * fade,
        scale: interpolate(enter, [0, 1], [1.06, 1]),
      }}
    >
      {screen(vertical ? "cover" : "contain")}
    </AbsoluteFill>
  );

  if (event.layout === "bubble") {
    const [fx, fy, fh] = faceBox(tracks, from + frame);
    const d = 0.36 * width;
    const margin = 0.05 * width;
    const left = event.corner.endsWith("left") ? margin : width - margin - d;
    const top = event.corner.startsWith("top")
      ? 0.07 * height
      : height - 0.07 * height - d;
    // Scale the speaker so the face fills about 60% of the circle, centred on the face.
    const z = Math.min(
      4,
      Math.max(d / width, (0.6 * d) / Math.max(0.05, fh * height)),
    );
    const pop = spring({
      frame: frame - 3,
      fps,
      config: { damping: 12, stiffness: 180 },
      durationInFrames: 14,
    });
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        {full}
        <div
          style={{
            position: "absolute",
            left,
            top,
            width: d,
            height: d,
            borderRadius: "50%",
            overflow: "hidden",
            border: `${7 * k}px solid white`,
            boxShadow: `0 ${12 * k}px ${40 * k}px rgba(0,0,0,.45)`,
            scale: pop,
            backgroundColor: "#222",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: width * z,
              height: height * z,
              left: d / 2 - fx * width * z,
              top: d / 2 - fy * height * z,
            }}
          >
            {speaker({ width: "100%", height: "100%" }, "fill")}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  if (event.layout === "front" && foreground) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        {full}
        <AbsoluteFill
          style={{
            transformOrigin: "50% 100%",
            scale: interpolate(enter, [0, 1], [0.8, 0.92]),
            filter: `drop-shadow(0 ${10 * k}px ${30 * k}px rgba(0,0,0,.55))`,
          }}
        >
          <OffthreadVideo
            src={media(foreground)}
            muted
            transparent
            trimBefore={from}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill style={{ opacity: fade }}>{full}</AbsoluteFill>;
};
