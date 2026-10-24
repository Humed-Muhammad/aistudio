import { Component as ReactComponent, type ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { kitFor } from "../graphicKits";
import type { ShortEvent } from "../types";
import { ELEMENTS } from "./registry.gen";
import type { ElementMeta, ElementValues } from "./types";

/** Field defaults with the graphic's own values on top. */
export const valuesFor = (
  meta: ElementMeta,
  props?: Record<string, unknown>,
): ElementValues => {
  const v: ElementValues = {};
  for (const f of meta.fields)
    v[f.key] =
      (props?.[f.key] as ElementValues[string] | undefined) ?? f.default;
  return v;
};

/** A graphic that throws (say, an odd value typed into a field) draws nothing instead of breaking the whole edit. */
class Guard extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** One library graphic in the edit: looked up by id, placed at (x, y) and scaled by size unless it is full-frame. */
export const ElementLayer: React.FC<{
  event: ShortEvent;
  duration: number;
  accent: string;
  style?: string;
}> = ({ event: e, duration, accent, style }) => {
  const { width, height } = useVideoConfig();
  const entry = ELEMENTS[e.element ?? ""];
  if (!entry) return null;
  const { meta, Component } = entry;
  const kit = kitFor(style);
  const drawn = (
    <Guard>
      <Component
        v={valuesFor(meta, e.props)}
        theme={kit.dark}
        kit={kit}
        accent={e.accent || accent}
        durationInFrames={duration}
        width={width}
        height={height}
        k={width / 1080}
      />
    </Guard>
  );
  if (meta.layout === "full") return <AbsoluteFill>{drawn}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: e.x * width,
          top: e.y * height,
          transform: `translate(-50%, -50%) scale(${e.size || 1})`,
          transformOrigin: "50% 50%",
        }}
      >
        {drawn}
      </div>
    </AbsoluteFill>
  );
};
