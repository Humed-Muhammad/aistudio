import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import type { Tracks } from "./types";

export type Side = "top" | "bottom" | "left" | "right";
const EXIT = 12;

/** 0 → 1 as the graphic pushes in, back to 0 as it leaves. */
export const usePush = (duration: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 14,
  });
  const out = interpolate(frame, [duration - EXIT, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return inn * (1 - out);
};

type Props = {
  side: Side;
  share: number; // part of the frame the graphic takes once fully in (1 = all of it)
  duration: number;
  from: number;
  video: string | null;
  tracks: Tracks;
  accent: string;
  children: React.ReactNode; // the graphic, laid out at its full size
};

/**
 * The graphic slides in from one edge and physically pushes the speaker video the other way,
 * then pulls back out. Once fully in, the speaker is framed on the face in the space left.
 */
export const Push: React.FC<Props> = ({
  side,
  share,
  duration,
  from,
  video,
  tracks,
  accent,
  children,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = width / 1080;
  const p = usePush(duration);
  const across = side === "left" || side === "right";
  const full = across ? width : height;
  const panelFull = share * full;
  const panel = p * panelFull;
  const rest = full - panel;
  // Keep the face in view in the space left: shift the video toward the face as the push completes.
  const face = tracks.face[from + frame] ?? tracks.face[from];
  const centre = (across ? (face?.[0] ?? 0.5) : (face?.[1] ?? 0.38)) * full;
  const restFull = full - panelFull;
  const shift =
    p * Math.min(Math.max(centre - restFull / 2, 0), full - restFull);
  const start = side === "top" || side === "left";

  const panelBox: React.CSSProperties = across
    ? { top: 0, bottom: 0, width: panel, [start ? "left" : "right"]: 0 }
    : { left: 0, right: 0, height: panel, [start ? "top" : "bottom"]: 0 };
  const inner: React.CSSProperties = across
    ? { top: 0, bottom: 0, width: panelFull, [start ? "right" : "left"]: 0 }
    : { left: 0, right: 0, height: panelFull, [start ? "bottom" : "top"]: 0 };
  const videoBox: React.CSSProperties = across
    ? { top: 0, bottom: 0, width: rest, [start ? "right" : "left"]: 0 }
    : { left: 0, right: 0, height: rest, [start ? "bottom" : "top"]: 0 };
  const line = `${3 * k}px solid ${accent}`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#05060d" }}>
      {video && share < 1 ? (
        <div
          style={{
            position: "absolute",
            overflow: "hidden",
            ...videoBox,
            ...(p > 0.01
              ? {
                  [across
                    ? start
                      ? "borderLeft"
                      : "borderRight"
                    : start
                      ? "borderTop"
                      : "borderBottom"]: line,
                }
              : {}),
          }}
        >
          <div
            style={{
              position: "absolute",
              width,
              height,
              [across ? "left" : "top"]: -shift,
              [across ? "top" : "left"]: 0,
            }}
          >
            <Video
              src={staticFile(video)}
              muted
              trimBefore={from}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
      ) : video ? (
        // Full-screen graphic: the whole video is pushed out of frame.
        <div
          style={{
            position: "absolute",
            width,
            height,
            [across ? "left" : "top"]: (start ? 1 : -1) * panel,
          }}
        >
          <Video
            src={staticFile(video)}
            muted
            trimBefore={from}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      ) : null}
      <div style={{ position: "absolute", overflow: "hidden", ...panelBox }}>
        <div style={{ position: "absolute", ...inner }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};
