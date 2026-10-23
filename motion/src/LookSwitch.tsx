import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import {
  Backdrop,
  BackLight,
  DEFAULT_LOOK,
  footageStyle,
  needsSubject,
  Subject,
  Vignette,
} from "./Background";
import { useMedia } from "./media";
import type { Reframe } from "./tracking";
import type { BackgroundLook, Tracks } from "./types";

const FADE = 8; // frames to cross-fade into and out of a switched look

/**
 * A different look for part of the edit (e.g. the real room while the speaker shows their setup).
 * Drawn over the main look inside a Sequence and cross-faded in and out; the framing and grade stay.
 */
export const LookSwitch: React.FC<{
  look: BackgroundLook;
  video: string;
  foreground: string | null;
  tracks: Tracks;
  reframe: Reframe;
  from: number;
  duration: number;
  k: number;
}> = ({
  look: partial,
  video,
  foreground,
  tracks,
  reframe,
  from,
  duration,
  k,
}) => {
  const media = useMedia();
  const frame = useCurrentFrame();
  const look = { ...DEFAULT_LOOK, ...partial };
  const subject = foreground && needsSubject(look) ? foreground : null;
  const opacity = interpolate(
    frame,
    [0, FADE, duration - FADE, duration],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <Video
        src={media(video)}
        muted
        trimBefore={from}
        style={subject ? footageStyle(look, k) : undefined}
      />
      {subject ? <Backdrop bg={look} reframe={reframe} /> : null}
      {subject ? <BackLight bg={look} tracks={tracks} /> : null}
      {subject ? (
        <Subject bg={look} foreground={subject} trimBefore={from} />
      ) : null}
      <Vignette bg={look} />
    </AbsoluteFill>
  );
};
