import { CalculateMetadataFunction, Composition } from "remotion";
import { Shorts } from "./Shorts";
import type { ShortsProps } from "./types";
import { ElementPreview, type ElementPreviewProps } from "./elements/Preview";
import { ELEMENTS } from "./elements/registry.gen";
import { Film } from "./film/Film";
import { DEFAULT_FILM, FilmScene, ScenePreview, type ScenePreviewProps } from "./film/Preview";
import { SCENES } from "./film/registry.gen";
import type { FilmProps } from "./film/types";
import { Faceless, facelessDefaults, type FacelessProps } from "./faceless/Faceless";
import { Thumbnail, thumbnailDefaults } from "./faceless/Thumbnail";

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

// Motion Studio films: real props come from runs/films/<job>/film-props.json (written by films.py).
const filmProps: FilmProps = { film: DEFAULT_FILM, fps: 30, width: 1080, height: 1920, durationInFrames: 90, sounds: {}, assets: [] };
const facelessMetadata: CalculateMetadataFunction<FacelessProps> = ({ props }) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: props.durationInFrames,
});
const filmMetadata: CalculateMetadataFunction<FilmProps> = ({ props }) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: props.durationInFrames,
});
const filmSceneMetadata: CalculateMetadataFunction<FilmProps & { index: number }> = ({ props }) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: Math.max(1, Math.round((props.film.scenes[props.index]?.duration ?? 3) * props.fps)),
});
const SIZE: Record<string, [number, number]> = { portrait: [1080, 1920], square: [1080, 1080], feed: [1080, 1350], landscape: [1920, 1080] };
const scenePreviewMetadata: CalculateMetadataFunction<ScenePreviewProps> = ({ props }) => {
  const [width, height] = SIZE[props.film?.format ?? "portrait"] ?? SIZE.portrait;
  return { width, height, durationInFrames: Math.round((SCENES[props.id]?.meta.duration ?? 3) * 30) };
};

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
    {/* A faceless YouTube video from the Channel tool: --props render-props.json written by channel_render.py. */}
    <Composition id="Faceless" component={Faceless} fps={30} width={1920} height={1080} durationInFrames={90} defaultProps={facelessDefaults} calculateMetadata={facelessMetadata} />
    {/* Its 1280×720 YouTube thumbnail: --props thumbs/.props-N.json (channel.py thumbnails). */}
    <Composition id="Thumbnail" component={Thumbnail} fps={30} width={1280} height={720} durationInFrames={1} defaultProps={thumbnailDefaults} />
    <Composition id="Film" component={Film} fps={30} width={1080} height={1920} durationInFrames={90} defaultProps={filmProps} calculateMetadata={filmMetadata} />
    {/* One scene of a film, for review stills: --props film-props.json plus "index". */}
    <Composition
      id="FilmScene"
      component={FilmScene}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={90}
      defaultProps={{ ...filmProps, index: 0 }}
      calculateMetadata={filmSceneMetadata}
    />
    {/* One scene template with its default words: --props '{"id":"hook","film":{"format":"landscape"}}' */}
    <Composition
      id="ScenePreview"
      component={ScenePreview}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={90}
      defaultProps={{ id: Object.keys(SCENES)[0] ?? "" } as ScenePreviewProps}
      calculateMetadata={scenePreviewMetadata}
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
