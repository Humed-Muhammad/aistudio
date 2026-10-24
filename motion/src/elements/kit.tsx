import { Fragment, useId } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { accentCss, type Theme } from "../graphicKits";
import { mix, onAccent } from "../colors";
import type { ElementValues, FieldValue } from "./types";

// Shared building blocks for library graphics, so every graphic moves and looks like one family.
// Motion: enter with a spring, hold, exit over the last frames. Looks: the video's graphic style (Theme).

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export { mix, onAccent };

/** Where a graphic is in its life: frame, enter 0→1 (spring), exit 1→0 (last frames), and both combined. */
export const useLife = (durationInFrames: number, exitFrames = 10) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 16 });
  const exit = interpolate(frame, [durationInFrames - exitFrames, durationInFrames], [1, 0], clamp);
  return { frame, fps, enter, exit, life: Math.min(enter, exit), t: frame / fps };
};

/** A bouncy pop in (overshoots a little) starting at delay frames. */
export const pop = (frame: number, fps: number, delay = 0, damping = 12) =>
  spring({ frame: frame - delay, fps, config: { damping, stiffness: 180 }, durationInFrames: 22 });

/** A smooth 0→1 starting at delay frames. */
export const ease = (frame: number, fps: number, delay = 0, frames = 16) =>
  spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: frames });

/** Reads a field value with the right type (values come from JSON and the editor). */
export const str = (v: ElementValues, key: string) => String(v[key] ?? "");
export const num = (v: ElementValues, key: string) => Number(v[key] ?? 0);
export const bool = (v: ElementValues, key: string) => v[key] === true || v[key] === "true";
export const list = (v: ElementValues, key: string): string[] => {
  const x: FieldValue | undefined = v[key];
  if (Array.isArray(x)) return x.map(String).filter((s) => s.trim());
  return String(x ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
};

/** Text with *starred* words in the style's accent treatment (colour, serif, marker, glow…). */
export const Starred: React.FC<{
  text: string;
  theme: Theme;
  accent: string;
  size: number;
  color?: string;
  weight?: number;
  font?: string;
  align?: "left" | "center" | "right";
  style?: React.CSSProperties;
}> = ({ text, theme, accent, size, color, weight, font, align = "center", style }) => (
  <div
    style={{
      fontFamily: font ?? theme.head,
      fontWeight: weight ?? theme.headWeight,
      fontSize: size,
      lineHeight: 1.1,
      letterSpacing: theme.tracking,
      textTransform: theme.upper ? "uppercase" : undefined,
      color: color ?? theme.ink ?? theme.text,
      textAlign: align,
      textWrap: "balance",
      ...style,
    }}
  >
    {text
      .split(/(\*[^*]+\*)/)
      .filter(Boolean)
      .map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span key={i} style={accentCss(theme, accent, size)}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
  </div>
);

/** A panel in the video's graphic style (glass, bold, editorial…): surface, border, blur, shadow, corners. */
export const panel = (theme: Theme, k: number, radius = 28): React.CSSProperties => ({
  background: theme.card,
  border: `${2 * (theme.line ?? 1) * k}px solid ${theme.border}`,
  boxShadow: theme.shadow,
  backdropFilter: theme.blur,
  WebkitBackdropFilter: theme.blur,
  borderRadius: radius * theme.radius * k,
  color: theme.text,
});

/** Font size that fits text of this length on one line: base size up to fits characters, smaller beyond. */
export const fit = (text: string, base: number, fits: number) => base * Math.min(1, fits / Math.max(1, [...text].length));

/** An SVG id unique to this graphic instance (many graphics share one page in the library and the preview). */
export const useSvgId = (name: string) => `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

/** A soft shadow that lifts text off busy video without a hard outline. */
export const lift = (k: number) => `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.45)`;
