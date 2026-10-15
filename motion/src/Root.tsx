import { CalculateMetadataFunction, Composition } from "remotion";
import { Shorts } from "./Shorts";
import type { ShortsProps } from "./types";

// Real props come from runs/<job>/render-props.json (written by shorts.py).
const defaultProps: ShortsProps = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 90,
  video: null,
  foreground: null,
  captions: [],
  tracks: {
    fps: 30,
    width: 1080,
    height: 1920,
    frames: 0,
    cuts: [],
    hands: { left: [], right: [] },
    face: [],
  },
  plan: {
    caption_preset: "bold",
    caption_y: 0.72,
    highlight_color: "#FFE14D",
    progress_bar: false,
    events: [],
    notes: "",
  },
};

const calculateMetadata: CalculateMetadataFunction<ShortsProps> = ({
  props,
}) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: props.durationInFrames,
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Shorts"
    component={Shorts}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={90}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);
