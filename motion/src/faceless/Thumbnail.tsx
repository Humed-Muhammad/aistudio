import type React from "react";
import { AbsoluteFill, Img } from "remotion";
import { kitFor } from "../graphicKits";
import { MediaBase, useMedia } from "../media";
import { Backdrop } from "../film/Backdrop";
import type { BackdropName } from "../film/types";

// A 1280×720 YouTube thumbnail for a Channel video: one of the video's illustrations full-bleed and the thumbnail text
// on a tilted sticker card in the channel's look, big enough to read on a phone. Variants move the card to another side.

export type ThumbnailProps = {
  text: string;
  /** An illustration from the video (assets/…), or none: the channel's backdrop. */
  image: string | null;
  style: string;
  mode: "dark" | "light";
  accent: string;
  accent2: string;
  backdrop: BackdropName;
  base?: string | null;
  variant: number;
};

const Card: React.FC<{ p: ThumbnailProps }> = ({ p }) => {
  const theme = kitFor(p.style)[p.mode];
  const words = p.text.trim().split(/\s+/);
  // Two lines at most; the last word in the accent colour.
  const half = Math.ceil(words.length / 2);
  const lines = words.length > 2 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [words.join(" ")];
  // Each line stays on one line: the longest sets the size (uppercase rounded type is about 0.62 em a letter).
  const size = Math.min(150, 720 / (Math.max(...lines.map((l) => l.length), 5) * 0.62));
  const left = p.variant % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        [left ? "left" : "right"]: 48,
        bottom: p.variant === 2 ? undefined : 56,
        top: p.variant === 2 ? 56 : undefined,
        whiteSpace: "nowrap",
        padding: "22px 34px 28px",
        background: theme.card.startsWith("linear") || theme.card.startsWith("rgba") ? "#fffaf0" : theme.card,
        border: `${6 * (theme.line ?? 1)}px solid ${theme.border.startsWith("rgba") ? "#2b2d42" : theme.border}`,
        borderRadius: 34 * (theme.radius ?? 1) * 0.6,
        boxShadow: `0 14px 0 ${theme.border.startsWith("rgba") ? "#2b2d42" : theme.border}`,
        rotate: `${left ? -3 : 3}deg`,
        fontFamily: theme.head,
        fontWeight: Math.max(700, theme.headWeight),
        lineHeight: 1.0,
        letterSpacing: "-0.01em",
        textTransform: "uppercase",
        color: theme.text.startsWith("#f") ? "#2b2d42" : theme.text,
      }}
    >
      {lines.map((l, i) => {
        const parts = l.split(" ");
        return (
          <div key={i} style={{ fontSize: size }}>
            {parts.map((w, j) => (
              <span
                key={j}
                style={{
                  color: i === lines.length - 1 && j === parts.length - 1 ? p.accent : undefined,
                }}
              >
                {w}
                {j < parts.length - 1 ? " " : ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

const Body: React.FC<{ p: ThumbnailProps }> = ({ p }) => {
  const media = useMedia();
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      {p.image ? (
        <Img
          src={media(p.image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            scale: 1.04,
          }}
        />
      ) : (
        <Backdrop name={p.backdrop} kit={kitFor(p.style)} mode={p.mode} accent={p.accent} accent2={p.accent2} />
      )}
      <Card p={p} />
    </AbsoluteFill>
  );
};

export const Thumbnail: React.FC<ThumbnailProps> = (p) => (
  <MediaBase.Provider value={p.base ?? null}>
    <Body p={p} />
  </MediaBase.Provider>
);

export const thumbnailDefaults: ThumbnailProps = {
  text: "Why space is silent",
  image: null,
  style: "cartoon",
  mode: "light",
  accent: "#FF7A59",
  accent2: "#6EC1FF",
  backdrop: "cartoon",
  base: null,
  variant: 0,
};
