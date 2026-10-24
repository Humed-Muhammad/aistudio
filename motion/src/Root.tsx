import { CalculateMetadataFunction, Composition } from "remotion";
import { Shorts } from "./Shorts";
import type { ShortsProps } from "./types";
import { ElementPreview, type ElementPreviewProps } from "./elements/Preview";
import { ELEMENTS } from "./elements/registry.gen";

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
    caption_preset: "duo",
    caption_font: "noto_black",
    caption_motion: "pop",
    caption_y: 0.72,
    highlight_color: "#6EC1FF",
    progress_bar: false,
    emphasis: [],
    auto_sound: true,
    events: [],
    notes: "",
  },
  clips: {},
  assets: [],
  lottie: {},
};

const calculateMetadata: CalculateMetadataFunction<ShortsProps> = ({
  props,
}) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: props.durationInFrames,
});

const elementMetadata: CalculateMetadataFunction<ElementPreviewProps> = ({ props }) => ({
  durationInFrames: Math.round((ELEMENTS[props.id]?.meta.duration ?? 3) * 30),
});

export const RemotionRoot: React.FC = () => (
  <>
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
    {/* One library graphic on a plain backdrop, for test stills: --props '{"id":"name-lower-third"}' */}
    <Composition
      id="Element"
      component={ElementPreview}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={90}
      defaultProps={{ id: Object.keys(ELEMENTS)[0] ?? "" } as ElementPreviewProps}
      calculateMetadata={elementMetadata}
    />
  </>
);
