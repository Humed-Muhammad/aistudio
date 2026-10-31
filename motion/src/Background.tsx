import { useId } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mix } from "./colors";
import { useMedia } from "./media";
import { faceAt, faceHome, type Reframe } from "./tracking";
import type { BackgroundLook, Tracks } from "./types";
import { wallLayers } from "./wallLights";

/** Mirrors Background in shorts.py; plans saved before backgrounds existed have none. */
export const DEFAULT_LOOK: BackgroundLook = {
  mode: "original",
  color: "#141518",
  color2: "#2A2B31",
  image: "",
  blur: 0.55,
  dim: 0.25,
  light_color: "#8FB8FF",
  glow: 0,
  rim: 0,
  vignette: 0,
  spotlight: 0,
  shadow: 0,
  outline: 0,
  outline_color: "#FFFFFF",
  scale: 1,
  wrap: 0,
  reframe: 0,
  grade: 0,
  grain: 0,
  lift: 0,
  tube: "none",
  lamp: "tube",
  pattern: "pool",
};

/** The colour the "room" casts on the speaker: what wraps their edges and tints their shadows. */
export const wallColor = (bg: BackgroundLook): string | null =>
  bg.mode === "studio"
    ? mix(bg.color, bg.color2, 0.6)
    : bg.mode === "glow"
      ? bg.light_color
      : bg.mode === "gradient"
        ? mix(bg.color, bg.color2, 0.5)
        : bg.mode === "color"
          ? bg.color
          : bg.mode === "grid"
            ? "#F3F1EC"
            : null;

const alpha = (hex: string, a: number) =>
  hex +
  Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, "0");

/** The person is drawn as a separate cutout layer when anything changes around or on them. */
export const needsSubject = (bg: BackgroundLook) =>
  bg.mode !== "original" ||
  bg.glow > 0 ||
  bg.spotlight > 0 ||
  bg.rim > 0 ||
  bg.shadow > 0 ||
  bg.outline > 0 ||
  bg.wrap > 0 ||
  bg.scale > 1;

/** CSS for the full-frame footage underneath: blurred and dimmed in blur mode, untouched otherwise. */
export const footageStyle = (
  bg: BackgroundLook,
  k: number,
  cutout: boolean,
): React.CSSProperties | undefined => {
  const lift = liftFilter(bg);
  if (!(cutout && bg.mode === "blur")) return lift ? { filter: lift } : undefined;
  return {
    filter: `blur(${bg.blur * 44 * k}px) brightness(${1 - bg.dim * 0.8}) saturate(1.1)` + (lift ? " " + lift : ""),
    scale: 1.12, // hides the soft edge a blur leaves at the frame border
  };
};

/** Brightens dim footage (the person and the real room). Generated walls keep their designed colours. */
export const liftFilter = (bg: BackgroundLook) =>
  bg.lift > 0 ? `brightness(${1 + 0.35 * bg.lift}) saturate(${1 + 0.1 * bg.lift})` : undefined;

/** Blurred look over the footage: the room with the speaker removed (room.jpg from shorts.room_plate), blurred and
 * dimmed like the footage. Blurring the footage itself smears the speaker into a dark halo around the cutout. */
export const RoomBlur: React.FC<{ bg: BackgroundLook; room: string | null; k: number }> = ({ bg, room, k }) => {
  const media = useMedia();
  return bg.mode === "blur" && room ? (
    <Img
      src={media(room)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...footageStyle(bg, k, true) }}
    />
  ) : null;
};

/** Replacement background plus any LED light tubes standing on it. */
export const Backdrop: React.FC<{
  bg: BackgroundLook;
  tracks: Tracks;
  reframe?: Reframe;
}> = ({ bg, tracks, reframe }) => (
  <>
    <Wall bg={bg} anchor={faceHome(tracks)} />
    <Tubes bg={bg} reframe={reframe} />
  </>
);

/**
 * Glowing vertical LED tubes on the wall, like a podcast set (the blue tube in the creator's reference).
 * Placed in final-frame positions: the reframe that scales this layer is undone for their position and size.
 */
const Tubes: React.FC<{ bg: BackgroundLook; reframe?: Reframe }> = ({
  bg,
  reframe,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const k = width / 1080;
  const wall = wallColor(bg);
  if (!bg.tube || bg.tube === "none" || !wall || bg.mode === "grid")
    return null;
  const r = reframe ?? { s: 1, ox: 0.5, oy: 0.5, tx: 0, ty: 0 };
  const unX = (x: number) => r.ox + (x - r.tx - r.ox) / r.s;
  const unY = (y: number) => r.oy + (y - r.ty - r.oy) / r.s;
  const glow = mix(wall, "#ffffff", 0.6);
  const breathe = 0.94 + Math.sin(frame / 45) * 0.04;
  const w = (34 * k) / r.s;
  const lamp = bg.lamp ?? "tube";
  // Light the lamp throws on the wall around it: a soft pool centred on it.
  const pool = (x: number, y: number, wide: number, tall: number, a = 0.32) => (
    <div
      style={{
        position: "absolute",
        left: `${unX(x) * 100}%`,
        top: `${unY(y) * 100}%`,
        width: `${(wide / r.s) * 100}%`,
        height: `${(tall / r.s) * 100}%`,
        translate: "-50% -50%",
        background: `radial-gradient(closest-side, ${alpha(glow, a * breathe)}, transparent)`,
      }}
    />
  );
  const bloom = (size: number, c = glow) => `0 0 ${size * 0.6}px ${c}, 0 0 ${size * 2}px ${alpha(c, 0.85)}, 0 0 ${size * 5}px ${alpha(c, 0.5)}`;
  const at = (x: number, y: number): React.CSSProperties => ({ position: "absolute", left: `${unX(x) * 100}%`, top: `${unY(y) * 100}%`, translate: "-50% -50%" });
  /** One lamp of the chosen design, standing at x (0-1) between top and bottom on the wall. */
  const other = (x: number, top: number, bottom: number) => {
    const mid = (top + bottom) / 2;
    const span = (bottom - top) / r.s;
    if (lamp === "twin")
      return (
        <div key={x}>
          {tube(x - 0.025, top + 0.03, bottom)}
          {tube(x + 0.025, top, bottom - 0.04, 0.7)}
        </div>
      );
    if (lamp === "neon") {
      // A short LED bar mounted on the wall, fully in frame (moved in from the edge), its light falling down the wall.
      const cx = x < 0.5 ? x + 0.1 : x - 0.1;
      const cy = top + 0.08;
      return (
        <div key={x}>
          {pool(cx, cy + 0.035, 0.42, 0.2, 0.42)}
          <div style={{ ...at(cx, cy), width: `${(0.2 / r.s) * 100}%`, height: w * 0.42, borderRadius: w, background: `linear-gradient(180deg, ${glow}, #fff 40%, #fff 60%, ${glow})`, opacity: breathe, boxShadow: bloom(w * 0.7) }} />
        </div>
      );
    }
    if (lamp === "globe") {
      // A pendant bulb hanging on a cord from the ceiling, warm white.
      const warm = mix(glow, "#FFE7C4", 0.6);
      const d = (90 * k) / r.s;
      return (
        <div key={x}>
          {pool(x, mid - 0.06, 0.55, 0.38, 0.38)}
          <div style={{ position: "absolute", left: `${unX(x) * 100}%`, top: 0, width: Math.max(1, 3 * k), height: `${unY(mid - 0.06) * 100}%`, translate: "-50% 0", background: "rgba(10,10,14,.75)" }} />
          <div style={{ ...at(x, mid - 0.06), width: d, height: d * 1.1, borderRadius: "50% 50% 46% 46%", background: `radial-gradient(circle at 45% 40%, #fff, ${warm} 55%, ${alpha(warm, 0.8)})`, opacity: breathe, boxShadow: bloom(d * 0.6, warm) }} />
        </div>
      );
    }
    if (lamp === "ring") {
      // A round LED ring lamp on the wall.
      const d = (230 * k) / r.s;
      return (
        <div key={x}>
          {pool(x, mid - 0.04, 0.5, 0.3, 0.3)}
          <div style={{ ...at(x, mid - 0.04), width: d, height: d, borderRadius: "50%", border: `${w * 0.55}px solid #fff`, opacity: breathe, boxShadow: `${bloom(w)}, inset ${bloom(w)}` }} />
        </div>
      );
    }
    if (lamp === "arch") {
      // A neon arch outline, like a doorway of light.
      const wd = (200 * k) / r.s;
      return (
        <div key={x}>
          {pool(x, mid, 0.5, (bottom - top) * 1.4, 0.3)}
          <div style={{ ...at(x, mid), width: wd, height: `${span * 100}%`, borderRadius: `${wd / 2}px ${wd / 2}px 0 0`, border: `${w * 0.45}px solid #fff`, borderBottom: "none", opacity: breathe, boxShadow: `${bloom(w * 0.8)}, inset ${bloom(w * 0.8)}` }} />
        </div>
      );
    }
    if (lamp === "hex") {
      // Three hexagon light panels, like a gaming setup.
      const hw = (120 * k) / r.s;
      const hex = "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)";
      const cell = (dx: number, dy: number, a: number) => (
        <div style={{ position: "absolute", left: `calc(${unX(x) * 100}% + ${dx * hw}px)`, top: `calc(${unY(mid - 0.05) * 100}% + ${dy * hw}px)`, translate: "-50% -50%", width: hw, height: hw * 0.87, clipPath: hex, background: `radial-gradient(circle, #fff 0%, ${glow} 70%)`, opacity: a * breathe }} />
      );
      return (
        <div key={x} style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 ${w}px ${glow}) drop-shadow(0 0 ${w * 3}px ${alpha(glow, 0.7)})` }}>
          {pool(x, mid - 0.05, 0.55, 0.3, 0.4)}
          {cell(0, 0, 1)}
          {cell(0.78, 0.45, 0.85)}
          {cell(0, 0.92, 0.7)}
        </div>
      );
    }
    return tube(x, top, bottom);
  };
  const tube = (x: number, top: number, bottom: number, a = 1) => (
    <div key={x}>
      {/* Light the tube throws on the wall around it. */}
      <div
        style={{
          position: "absolute",
          left: `${unX(x) * 100}%`,
          top: `${unY((top + bottom) / 2) * 100}%`,
          width: `${(0.5 / r.s) * 100}%`,
          height: `${(((bottom - top) * 1.6) / r.s) * 100}%`,
          translate: "-50% -50%",
          background: `radial-gradient(closest-side, ${alpha(glow, 0.32 * breathe)}, transparent)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${unX(x) * 100}%`,
          top: `${unY(top) * 100}%`,
          height: `${((bottom - top) / r.s) * 100}%`,
          width: w * 1.15,
          translate: "-50% 0",
          // A real LED bar: nearly square ends, a thin brushed-silver aluminium housing with slightly darker end
          // caps, and the lit diffuser inside.
          borderRadius: w * 0.14,
          borderStyle: "solid",
          borderWidth: `${Math.max(1, w * 0.3)}px ${Math.max(1, w * 0.12)}px`,
          borderColor: "#9a9fa7 #c9cdd3 #9a9fa7 #b4b8bf",
          background: `linear-gradient(90deg, ${glow}, #ffffff 35%, #ffffff 65%, ${glow})`,
          opacity: breathe * a,
          boxShadow: `inset 0 0 0 ${Math.max(0.5, w * 0.03)}px rgba(60,64,72,.35), ${bloom(w)}`,
        }}
      />
    </div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {bg.tube === "left" || bg.tube === "both" ? other(0.1, 0.17, 0.56) : null}
      {bg.tube === "right" || bg.tube === "both" ? other(0.9, 0.22, 0.55) : null}
    </AbsoluteFill>
  );
};

/** Replacement wall (covers the footage) for every mode except original and blur. */
/** Fixed fine noise over a wall (no animation): hides gradient banding, the way real paint and camera noise do. */
const Dither: React.FC = () => {
  const id = "dither" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      width="100%"
      height="100%"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.05,
        mixBlendMode: "overlay",
      }}
    >
      <filter id={id}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves={2}
          seed={7}
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
};

const Wall: React.FC<{ bg: BackgroundLook; anchor: [number, number] }> = ({
  bg,
  anchor,
}) => {
  const media = useMedia();
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const k = width / 1080;
  if (bg.mode === "color")
    return <AbsoluteFill style={{ backgroundColor: bg.color }} />;
  if (bg.mode === "gradient")
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${bg.color} 0%, ${bg.color2} 100%)`,
        }}
      />
    );
  if (bg.mode === "studio")
    // Lit studio wall (light designs in wallLights.ts). A fixed fine noise stops the smooth gradients banding.
    return (
      <AbsoluteFill
        style={{
          overflow: "hidden",
          // Brightness slider (dim): 0.5 = as designed, 0 = brighter, 1 = darker.
          filter:
            bg.dim !== 0.5 ? `brightness(${1.35 - bg.dim * 0.7})` : undefined,
        }}
      >
        {wallLayers(bg, anchor, Math.sin(frame / 70), k).map((style, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, ...style }} />
        ))}
        <Dither />
      </AbsoluteFill>
    );
  if (bg.mode === "grid")
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#F3F1EC",
          backgroundImage: `linear-gradient(rgba(20,20,40,.07) ${1.5 * k}px, transparent ${1.5 * k}px), linear-gradient(90deg, rgba(20,20,40,.07) ${1.5 * k}px, transparent ${1.5 * k}px)`,
          backgroundSize: `${54 * k}px ${54 * k}px`,
          backgroundPosition: "center",
        }}
      />
    );
  if (bg.mode === "image" && bg.image)
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={media(`assets/${bg.image}`)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            scale: 1.06,
            filter: `blur(${bg.blur * 18 * k}px) brightness(${1 - bg.dim * 0.8})`,
          }}
        />
      </AbsoluteFill>
    );
  if (bg.mode === "glow") {
    // Dark studio: deep base with a slow-breathing soft light high behind the speaker.
    const drift = Math.sin(frame / 50);
    return (
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(55% 32% at ${50 + drift * 3}% 30%, ${alpha(bg.light_color, 0.28)}, transparent 72%)`,
            `radial-gradient(80% 40% at 50% 105%, ${alpha(bg.light_color, 0.1)}, transparent 70%)`,
            `linear-gradient(180deg, ${bg.color2} 0%, ${bg.color} 100%)`,
          ].join(", "),
        }}
      />
    );
  }
  return null;
};

/** Light that sits behind the person: a soft glow that follows the face, and a top spotlight. */
export const BackLight: React.FC<{ bg: BackgroundLook; tracks: Tracks }> = ({
  bg,
  tracks,
}) => {
  const frame = useCurrentFrame();
  if (bg.glow <= 0 && bg.spotlight <= 0) return null;
  const [x, y] = faceAt(tracks, frame);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
      {bg.glow > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(42% 26% at ${x * 100}% ${(y + 0.06) * 100}%, ${alpha(bg.light_color, 0.75 * bg.glow)}, transparent 75%)`,
          }}
        />
      ) : null}
      {bg.spotlight > 0 ? (
        <AbsoluteFill
          style={{
            background: [
              `radial-gradient(48% 60% at 50% -8%, rgba(255,250,235,${0.45 * bg.spotlight}), transparent 70%)`,
              `radial-gradient(45% 10% at 50% 96%, rgba(255,250,235,${0.25 * bg.spotlight}), transparent 75%)`,
            ].join(", "),
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** The person cutout with outline, rim light and drop shadow, scaled up from the bottom edge. */
export const Subject: React.FC<{
  bg: BackgroundLook;
  foreground: string;
  /** Frames to skip when the layer starts later in the edit (look switches). */
  trimBefore?: number;
}> = ({ bg, foreground, trimBefore }) => {
  const media = useMedia();
  const { width } = useVideoConfig();
  const k = width / 1080;
  const id = "wrap" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const wall = wallColor(bg);
  const wrap = bg.wrap > 0 && wall ? bg.wrap : 0;
  const lift = liftFilter(bg);
  const filters: string[] = [...(lift ? [lift] : []), ...(wrap ? [`url(#${id})`] : [])];
  if (bg.outline > 0) {
    const o = Math.max(1, bg.outline * 10 * k);
    for (const [dx, dy] of [
      [o, 0],
      [-o, 0],
      [0, o],
      [0, -o],
    ])
      filters.push(`drop-shadow(${dx}px ${dy}px 0 ${bg.outline_color})`);
  }
  if (bg.rim > 0)
    filters.push(
      `drop-shadow(0 0 ${3 * k}px ${alpha(bg.light_color, 0.9 * bg.rim)})`,
      `drop-shadow(0 0 ${18 * k}px ${alpha(bg.light_color, 0.6 * bg.rim)})`,
    );
  // A real key light in front casts the speaker's shadow to one side onto the wall (soft, offset, faint),
  // plus a thin contact shadow that seats the edge. No even dark halo all round: that reads as a cut-out.
  if (bg.shadow > 0)
    filters.push(
      `drop-shadow(0 ${2 * k}px ${3 * k}px rgba(0,0,0,${0.35 * bg.shadow}))`,
      `drop-shadow(${26 * k}px ${14 * k}px ${30 * k}px rgba(0,0,0,${0.38 * bg.shadow}))`,
    );
  return (
    <AbsoluteFill
      style={{
        transformOrigin: "50% 100%",
        scale: bg.scale,
        filter: filters.length ? filters.join(" ") : undefined,
      }}
    >
      {wrap ? (
        // Match lighting. 1) Light wrap: the wall colour bleeds into an inner band along the cutout's edge,
        // as real light from a bright backdrop does. 2) The whole person is tinted toward the wall colour
        // (soft-light), so their shadows take on the room's hue. Clipped to the cutout's own alpha.
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter
            id={id}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceAlpha"
              stdDeviation={7 * k}
              result="blur"
            />
            <feComposite
              in="SourceAlpha"
              in2="blur"
              operator="out"
              result="edge"
            />
            <feFlood
              floodColor={mix(wall!, "#ffffff", 0.25)}
              floodOpacity={Math.min(1, 0.85 * wrap)}
              result="wallc"
            />
            <feComposite in="wallc" in2="edge" operator="in" result="wrapc" />
            <feFlood floodColor={wall!} result="tint" />
            <feBlend
              in="tint"
              in2="SourceGraphic"
              mode="soft-light"
              result="tinted"
            />
            <feComposite
              in="tinted"
              in2="SourceGraphic"
              operator="arithmetic"
              k2={0.55 * wrap}
              k3={1 - 0.55 * wrap}
              result="mixed"
            />
            <feBlend in="wrapc" in2="mixed" mode="screen" result="lit" />
            <feComposite in="lit" in2="SourceAlpha" operator="in" />
          </filter>
        </svg>
      ) : null}
      <OffthreadVideo
        src={media(foreground)}
        muted
        transparent
        trimBefore={trimBefore}
      />
    </AbsoluteFill>
  );
};

/**
 * Cinematic finish over the whole picture: a colour-matched soft-light tone (shadows lean toward the wall)
 * and moving film grain. Contrast is applied by the caller on the camera layer (gradeFilter).
 */
export const Finish: React.FC<{ bg: BackgroundLook }> = ({ bg }) => {
  const frame = useCurrentFrame();
  const id = "grain" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const wall = wallColor(bg);
  return (
    <>
      {bg.grade > 0 && wall ? (
        <AbsoluteFill
          style={{
            background: wall,
            mixBlendMode: "soft-light",
            opacity: 0.22 * bg.grade,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {bg.grain > 0 ? (
        <AbsoluteFill
          style={{
            mixBlendMode: "overlay",
            opacity: 0.16 * bg.grain,
            pointerEvents: "none",
          }}
        >
          <svg width="100%" height="100%" aria-hidden>
            <filter id={id}>
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves={2}
                seed={frame % 97}
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter={`url(#${id})`} />
          </svg>
        </AbsoluteFill>
      ) : null}
    </>
  );
};

/** Contrast and saturation for the camera layer (footage, wall and person together). */
export const gradeFilter = (bg: BackgroundLook) =>
  bg.grade > 0
    ? `contrast(${1 + 0.14 * bg.grade}) saturate(${1 + 0.06 * bg.grade}) brightness(${1 - 0.03 * bg.grade})`
    : undefined;

export const Vignette: React.FC<{ bg: BackgroundLook }> = ({ bg }) =>
  bg.vignette > 0 ? (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse 75% 65% at 50% 45%, transparent 45%, rgba(0,0,0,${0.8 * bg.vignette}) 100%)`,
      }}
    />
  ) : null;
