import { AbsoluteFill } from "remotion";
import { ElementLayer } from "./ElementLayer";
import { ELEMENTS } from "./registry.gen";
import type { ShortEvent } from "../types";

export type ElementPreviewProps = {
  id: string;
  props?: Record<string, unknown>;
  style?: string;
  accent?: string;
  /** Show it centred, as in the library, instead of at its default position. */
  centred?: boolean;
};

/** One library graphic over a neutral backdrop: library thumbnails and test stills. */
export const ElementPreview: React.FC<ElementPreviewProps> = ({ id, props, style, accent = "#6EC1FF", centred }) => {
  const meta = ELEMENTS[id]?.meta;
  if (!meta) return <AbsoluteFill style={{ background: "#222" }} />;
  const e = { type: "element", element: id, props, start: 0, end: meta.duration, size: 1, x: centred ? 0.5 : meta.x, y: centred ? 0.5 : meta.y } as ShortEvent;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 80% at 50% 30%, #4a5a78 0%, #1d2230 55%, #101218 100%)" }}>
      <ElementLayer event={e} duration={Math.round(meta.duration * 30)} accent={accent} style={style} />
    </AbsoluteFill>
  );
};
