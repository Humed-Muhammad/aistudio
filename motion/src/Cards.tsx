import { Fragment } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { ACCENT_FONT, BODY_FONT, HEADLINE_FONT } from "./fonts";
import type { ShortEvent, Tracks } from "./types";

// Card items appear one after another; shorts.py uses the same numbers to time the sounds.
export const ITEM_START = 8;
export const ITEM_GAP = 6;
const EXIT = 7;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Theme = {
  text: string;
  sub: string;
  card: string;
  border: string;
  shadow: string;
};
const DARK: Theme = {
  text: "#ffffff",
  sub: "rgba(222,230,255,.72)",
  // Opaque enough to read over bright video, still glassy on the dark scenes.
  card: "linear-gradient(160deg, rgba(44,52,86,.88), rgba(10,12,26,.9))",
  border: "rgba(150,175,255,.32)",
  shadow: "0 30px 80px rgba(0,0,20,.55)",
};
const LIGHT: Theme = {
  text: "#14151a",
  sub: "#5d5f6b",
  card: "#ffffff",
  border: "rgba(20,20,40,.07)",
  shadow: "0 24px 60px rgba(30,40,80,.14)",
};

/** "Reserve your *visual effects*": words in stars become the italic serif accent. */
const Headline: React.FC<{
  text: string;
  accent: string;
  theme: Theme;
  size: number;
}> = ({ text, accent, theme, size }) => {
  const parts = text.split(/(\*[^*]+\*)/).filter(Boolean);
  const plain = parts.length === 1 && !parts[0].startsWith("*");
  return (
    <div
      style={{
        textAlign: "center",
        lineHeight: 1.05,
        color: theme.text,
        fontFamily: plain ? HEADLINE_FONT : BODY_FONT,
        fontWeight: plain ? 800 : 500,
        fontSize: plain ? size * 0.9 : size * 0.62,
        letterSpacing: plain ? "-0.01em" : 0,
      }}
    >
      {parts.map((p, i) =>
        p.startsWith("*") ? (
          <span
            key={i}
            style={{
              fontFamily: ACCENT_FONT,
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: size * 1.15,
              color: accent,
              textShadow: `0 0 ${size * 0.4}px ${accent}55`,
            }}
          >
            {p.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </div>
  );
};

const pop = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 13, stiffness: 190 },
    durationInFrames: 14,
  });

/** Where a card is in its own timeline: the current item, the frame it became current, when each item appears. */
export type Beat = {
  active: number;
  since: number;
  reveal: (i: number) => number;
};

const ease = (frame: number, at: number, len = 12) =>
  interpolate(frame - at, [0, len], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

const Steps: React.FC<{
  e: ShortEvent;
  beat: Beat;
  accent: string;
  k: number;
}> = ({ e, beat, accent, k }) => {
  const frame = useCurrentFrame();
  const d = 66 * k;
  const gap = 58 * k;
  const { active, since } = beat;
  const grow = interpolate(frame - since, [2, 12], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const label = ease(frame, since + 4, 10);
  const now = e.items[active - 1] ?? "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 26 * k,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: `${16 * k}px ${22 * k}px`,
          borderRadius: 999,
          background: "rgba(10,12,24,.72)",
          border: `${1.5 * k}px solid rgba(255,255,255,.14)`,
          boxShadow: `0 ${16 * k}px ${40 * k}px rgba(0,0,0,.35)`,
        }}
      >
        {e.items.map((_, i) => {
          const n = i + 1;
          const current = n === active;
          const done = n < active || (current && grow > 0.95);
          return (
            <Fragment key={i}>
              {i > 0 ? (
                <div
                  style={{
                    width: gap,
                    height: 4 * k,
                    background: "rgba(255,255,255,.18)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "white",
                      transformOrigin: "left",
                      scale: `${n < active ? 1 : current ? grow : 0} 1`,
                    }}
                  />
                </div>
              ) : null}
              <div
                style={{
                  width: d,
                  height: d,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: BODY_FONT,
                  fontWeight: 700,
                  fontSize: 28 * k,
                  color: done ? "#0b0d18" : "white",
                  background: done ? "white" : "transparent",
                  border: `${3 * k}px solid ${done ? "white" : "rgba(255,255,255,.5)"}`,
                  boxShadow: current
                    ? `0 0 ${28 * k}px ${8 * k}px ${accent}99`
                    : "none",
                  scale: current
                    ? interpolate(ease(frame, since + 8, 8), [0, 1], [0.85, 1])
                    : 1,
                }}
              >
                {n}
              </div>
            </Fragment>
          );
        })}
      </div>
      {e.text || now ? (
        <div
          style={{
            textAlign: "center",
            textShadow: `0 ${2 * k}px ${16 * k}px rgba(0,0,0,.8)`,
          }}
        >
          {e.text ? (
            <div
              style={{
                fontFamily: BODY_FONT,
                fontWeight: 600,
                fontSize: 40 * k,
                color: "white",
              }}
            >
              {e.text.replace(/\*/g, "")}
            </div>
          ) : null}
          {now ? (
            <div
              key={active}
              style={{
                fontFamily: ACCENT_FONT,
                fontStyle: "italic",
                fontSize: 78 * k,
                lineHeight: 1.05,
                color: accent,
                opacity: label,
                filter: `blur(${(1 - label) * 8 * k}px)`,
                translate: `0 ${(1 - label) * 14 * k}px`,
              }}
            >
              {now}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const Slider: React.FC<{
  e: ShortEvent;
  accent: string;
  theme: Theme;
  k: number;
}> = ({ e, accent, theme, k }) => {
  const frame = useCurrentFrame();
  const target = Math.min(100, Math.max(0, parseFloat(e.value) || 100)) / 100;
  const t = interpolate(frame, [8, 34], [0, target], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const [from, to] = (e.label || "Beginner|Pro").split("|");
  const w = 760 * k;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 40 * k,
      }}
    >
      {e.text ? (
        <Headline text={e.text} accent={accent} theme={theme} size={70 * k} />
      ) : null}
      <div
        style={{
          width: w + 80 * k,
          padding: `${34 * k}px ${40 * k}px`,
          borderRadius: 40 * k,
          background: theme.card,
          border: `${1.5 * k}px solid ${theme.border}`,
          boxShadow: theme.shadow,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: BODY_FONT,
            fontWeight: 600,
            fontSize: 32 * k,
            color: theme.sub,
            marginBottom: 22 * k,
          }}
        >
          <span>{from}</span>
          <span>{to ?? ""}</span>
        </div>
        <div
          style={{
            position: "relative",
            height: 12 * k,
            borderRadius: 99,
            background: "rgba(130,140,170,.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: t * w,
              borderRadius: 99,
              background: `linear-gradient(90deg, ${accent}66, ${accent})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: t * w - 22 * k,
              top: -16 * k,
              width: 44 * k,
              height: 44 * k,
              borderRadius: "50%",
              background: "white",
              border: `${5 * k}px solid ${accent}`,
              boxShadow: `0 0 ${24 * k}px ${accent}`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

/** "$70,318" → prefix, number, suffix; the number counts up. */
const counting = (value: string, t: number) => {
  const m = value.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return value;
  const n = parseFloat(m[2].replace(/,/g, ""));
  const decimals = (m[2].split(".")[1] ?? "").length;
  const now = n * t;
  const text = now.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: m[2].includes(","),
  });
  return `${m[1]}${text}${m[3]}`;
};

const Stat: React.FC<{
  e: ShortEvent;
  accent: string;
  theme: Theme;
  k: number;
}> = ({ e, accent, theme, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [6, 36], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const w = 760 * k;
  const h = 300 * k;
  // A rising line with a little character, the same every render.
  const pts = Array.from({ length: 9 }, (_, i) => {
    const x = (i / 8) * w;
    const rise = Math.pow(i / 8, 1.6);
    const wobble = (random(`${e.value}${i}`) - 0.5) * 0.22;
    return [x, h * (0.9 - 0.78 * rise + wobble * (1 - rise))] as const;
  });
  const path = pts
    .map(([x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `C ${cx} ${py} ${cx} ${y} ${x} ${y}`;
    })
    .join(" ");
  const len = w * 1.6;
  const draw = interpolate(frame, [8, 40], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const seg = Math.min(7.999, draw * 8);
  const i = Math.floor(seg);
  const f = seg - i;
  const dot = [
    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f,
  ];
  return (
    <div
      style={{
        width: w + 100 * k,
        padding: `${44 * k}px ${50 * k}px`,
        borderRadius: 48 * k,
        background: theme.card,
        border: `${1.5 * k}px solid ${theme.border}`,
        boxShadow: `${theme.shadow}, 0 0 ${120 * k}px ${accent}33`,
        scale: interpolate(pop(frame, fps), [0, 1], [0.9, 1]),
      }}
    >
      {e.text ? (
        <div
          style={{
            fontFamily: BODY_FONT,
            fontWeight: 600,
            fontSize: 30 * k,
            color: theme.sub,
          }}
        >
          {e.text.replace(/\*/g, "")}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: HEADLINE_FONT,
          fontWeight: 800,
          fontSize: 130 * k,
          lineHeight: 1.05,
          color: theme.text,
          textShadow: `0 0 ${50 * k}px ${accent}88`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {counting(e.value, t)}
      </div>
      {e.label ? (
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 28 * k,
            color: theme.sub,
            marginBottom: 24 * k,
          }}
        >
          {e.label}
        </div>
      ) : null}
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="statfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity={0.35} />
            <stop offset="1" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={`${path} L ${w} ${h} L 0 ${h} Z`}
          fill="url(#statfill)"
          opacity={draw}
        />
        <path
          d={path}
          fill="none"
          stroke={accent}
          strokeWidth={6 * k}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - draw)}
          style={{ filter: `drop-shadow(0 0 ${10 * k}px ${accent})` }}
        />
        <circle
          cx={dot[0]}
          cy={dot[1]}
          r={13 * k}
          fill="white"
          style={{ filter: `drop-shadow(0 0 ${16 * k}px ${accent})` }}
        />
      </svg>
    </div>
  );
};

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

/** Icon from an item: uploaded image, "emoji Label", or a letter tile. */
const parseIcon = (item: string, assets: string[]) => {
  if (IMAGE.test(item))
    return assets.includes(item)
      ? { image: item, label: "" }
      : { glyph: item.slice(0, 1).toUpperCase(), label: "" };
  const [first, ...rest] = item.split(" ");
  if (!/^[\p{L}\p{N}]/u.test(first))
    return { glyph: first, label: rest.join(" ") };
  return { glyph: item.slice(0, 2), label: item };
};

const Icons: React.FC<{
  e: ShortEvent;
  beat: Beat;
  accent: string;
  theme: Theme;
  k: number;
  assets: string[];
}> = ({ e, beat, accent, theme, k, assets }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = e.items.length;
  const size = (n > 3 ? 170 : 210) * k;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 44 * k,
      }}
    >
      {e.text ? (
        <Headline text={e.text} accent={accent} theme={theme} size={70 * k} />
      ) : null}
      <div style={{ display: "flex", gap: 34 * k }}>
        {e.items.map((item, i) => {
          const icon = parseIcon(item, assets);
          const s = pop(frame, fps, beat.reveal(i));
          const current = i + 1 === beat.active;
          const press = current
            ? interpolate(
                frame,
                [
                  ITEM_START + n * ITEM_GAP + 6,
                  ITEM_START + n * ITEM_GAP + 10,
                  ITEM_START + n * ITEM_GAP + 16,
                ],
                [1, 0.9, 1.06],
                clamp,
              )
            : 1;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16 * k,
                scale: s * press,
                opacity: s,
              }}
            >
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: size * 0.26,
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  background: current
                    ? `linear-gradient(150deg, ${accent}, #1b2a8a)`
                    : "linear-gradient(150deg, #2b3350, #0d1020)",
                  border: `${2 * k}px solid ${current ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.14)"}`,
                  boxShadow: current
                    ? `0 0 ${60 * k}px ${accent}, inset 0 ${8 * k}px ${18 * k}px rgba(255,255,255,.35)`
                    : `0 ${18 * k}px ${40 * k}px rgba(0,0,0,.45), inset 0 ${6 * k}px ${14 * k}px rgba(255,255,255,.12)`,
                  fontSize: size * 0.5,
                  fontFamily: HEADLINE_FONT,
                  fontWeight: 800,
                  color: "white",
                }}
              >
                {"image" in icon && icon.image ? (
                  <Img
                    src={staticFile(`assets/${icon.image}`)}
                    style={{
                      width: "72%",
                      height: "72%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  icon.glyph
                )}
              </div>
              {icon.label ? (
                <div
                  style={{
                    fontFamily: BODY_FONT,
                    fontWeight: 600,
                    fontSize: 28 * k,
                    color: theme.text,
                  }}
                >
                  {icon.label}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Rows slide in one by one as they are spoken; the newest row is lit, earlier rows step back. */
const List: React.FC<{
  e: ShortEvent;
  beat: Beat;
  accent: string;
  theme: Theme;
  k: number;
}> = ({ e, beat, accent, theme, k }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20 * k,
      }}
    >
      {e.text ? (
        <div style={{ marginBottom: 16 * k }}>
          <Headline text={e.text} accent={accent} theme={theme} size={72 * k} />
        </div>
      ) : null}
      {e.items.map((item, i) => {
        const at = beat.reveal(i);
        const t = ease(frame, at, 14);
        if (t <= 0) return <div key={i} style={{ height: 106 * k }} />;
        const current = i + 1 === beat.active;
        const lit = current ? ease(frame, at, 10) : 0;
        return (
          <div
            key={i}
            style={{
              width: 840 * k,
              height: 106 * k,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 26 * k,
              padding: `0 ${30 * k}px`,
              borderRadius: 28 * k,
              background: theme.card,
              border: `${2 * k}px solid ${current ? accent : theme.border}`,
              boxShadow: `${theme.shadow}, 0 0 ${50 * k * lit}px ${accent}66`,
              opacity: t * (current || e.items.length < 2 ? 1 : 0.62),
              filter: t < 1 ? `blur(${(1 - t) * 10 * k}px)` : undefined,
              translate: `${(1 - t) * -70 * k}px 0`,
            }}
          >
            <div
              style={{
                width: 56 * k,
                height: 56 * k,
                borderRadius: "50%",
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                background: current ? accent : "rgba(255,255,255,.12)",
                color: "white",
                fontFamily: BODY_FONT,
                fontWeight: 700,
                fontSize: 26 * k,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                fontFamily: BODY_FONT,
                fontWeight: 600,
                fontSize: 38 * k,
                color: theme.text,
                lineHeight: 1.2,
              }}
            >
              {item}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CHIP_SLOTS = [
  [-220, -250],
  [220, 250],
  [220, -290],
  [-220, 290],
  [0, -430],
  [0, 430],
] as const;

const Chips: React.FC<{
  e: ShortEvent;
  beat: Beat;
  accent: string;
  theme: Theme;
  k: number;
}> = ({ e, beat, accent, theme, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "relative", width: 940 * k, height: 900 * k }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          translate: "-50% -50%",
          width: 600 * k,
        }}
      >
        <Headline
          text={e.text || " "}
          accent={accent}
          theme={theme}
          size={84 * k}
        />
      </div>
      {e.items.map((item, i) => {
        // Fixed, well-spaced slots in rows above and below the headline (never beside it), alternating
        // top/bottom and left/right, with a little fixed jitter so it does not look like a grid.
        const [sx, sy] = CHIP_SLOTS[i % CHIP_SLOTS.length];
        const x = 470 * k + (sx + (random(`x${i}`) - 0.5) * 40) * k;
        const y = 450 * k + (sy + (random(`y${i}`) - 0.5) * 30) * k;
        const s = pop(frame, fps, beat.reveal(i));
        const float = Math.sin(frame / 18 + i * 1.7) * 6 * k;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + float,
              translate: "-50% -50%",
              scale: s,
              padding: `${22 * k}px ${36 * k}px`,
              borderRadius: 26 * k,
              background: theme.card,
              border: `${1.5 * k}px solid ${theme.border}`,
              boxShadow: theme.shadow,
              fontFamily: BODY_FONT,
              fontWeight: 700,
              fontSize: 40 * k,
              color: theme.text,
              whiteSpace: "nowrap",
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
};

const Quote: React.FC<{
  e: ShortEvent;
  accent: string;
  k: number;
}> = ({ e, accent, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(frame, fps);
  return (
    <div
      style={{
        width: 900 * k,
        padding: `${34 * k}px ${44 * k}px`,
        borderRadius: 18 * k,
        background: "rgba(8,10,20,.82)",
        border: `${3 * k}px solid ${accent}`,
        boxShadow: `0 0 ${50 * k}px ${accent}55, 0 ${20 * k}px ${60 * k}px rgba(0,0,0,.5)`,
        textAlign: "center",
        opacity: s,
        translate: `0 ${interpolate(s, [0, 1], [30 * k, 0])}px`,
      }}
    >
      <div
        style={{
          fontFamily: BODY_FONT,
          fontWeight: 600,
          fontSize: 42 * k,
          lineHeight: 1.3,
          color: "white",
        }}
      >
        {e.text.split(/(\*[^*]+\*)/).map((p, i) =>
          p.startsWith("*") ? (
            <span key={i} style={{ color: accent }}>
              {p.slice(1, -1)}
            </span>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          ),
        )}
      </div>
      {e.label ? (
        <div
          style={{
            marginTop: 16 * k,
            fontFamily: BODY_FONT,
            fontSize: 26 * k,
            color: "rgba(255,255,255,.65)",
          }}
        >
          {e.label}
        </div>
      ) : null}
    </div>
  );
};

const Title: React.FC<{
  e: ShortEvent;
  accent: string;
  theme: Theme;
  k: number;
}> = ({ e, accent, theme, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(frame, fps);
  const line = interpolate(frame, [6, 16], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18 * k,
        scale: interpolate(s, [0, 1], [0.92, 1]),
        opacity: s,
      }}
    >
      {e.label ? (
        <div
          style={{
            fontFamily: BODY_FONT,
            fontWeight: 700,
            fontSize: 26 * k,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: theme.sub,
          }}
        >
          {e.label}
        </div>
      ) : null}
      <Headline text={e.text} accent={accent} theme={theme} size={110 * k} />
      <div
        style={{
          width: 420 * k,
          height: 6 * k,
          borderRadius: 99,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          scale: `${line} 1`,
          boxShadow: `0 0 ${20 * k}px ${accent}`,
        }}
      />
    </div>
  );
};

const Backdrop: React.FC<{ scene: ShortEvent["scene"]; accent: string }> = ({
  scene,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const k = width / 1080;
  if (scene === "light")
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#f3f1ec",
          backgroundImage: `linear-gradient(rgba(20,20,40,.06) ${1.5 * k}px, transparent ${1.5 * k}px), linear-gradient(90deg, rgba(20,20,40,.06) ${1.5 * k}px, transparent ${1.5 * k}px)`,
          backgroundSize: `${54 * k}px ${54 * k}px`,
        }}
      />
    );
  // Deep navy with slowly drifting glow, like the dark inspiration boards.
  const drift = Math.sin(frame / 40) * 60 * k;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(70% 45% at ${50 + drift / 20}% 18%, ${accent}55, transparent 70%), radial-gradient(60% 40% at 80% 95%, #7c3aed44, transparent 70%), linear-gradient(180deg, #070b22 0%, #04050d 100%)`,
      }}
    />
  );
};

type Props = {
  event: ShortEvent;
  duration: number;
  accent: string;
  from: number;
  video: string | null;
  tracks: Tracks;
  assets: string[];
};

/** Motion-graphic card. Rendered inside a Sequence, so frame 0 is its start. */
export const Card: React.FC<Props> = ({
  event: e,
  duration,
  accent,
  from,
  video,
  tracks,
  assets,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = width / 1080;
  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 9,
  });
  const fade = interpolate(frame, [duration - EXIT, duration], [1, 0], clamp);
  const theme = e.scene === "light" ? LIGHT : DARK;
  // Timeline in frames from the card's start; without one, items cascade in quickly.
  const marks = e.timeline.map(
    ([t, a]) => [Math.round(t * fps) - from, a] as const,
  );
  const cur = marks.filter(([f]) => f <= frame).pop() ?? marks[0];
  const beat: Beat = marks.length
    ? {
        active: cur[1],
        since: Math.max(0, cur[0]),
        reveal: (i) => {
          const m = marks.find(([, a]) => a >= i + 1);
          return m ? Math.max(0, m[0]) : 1e6; // never in this card
        },
      }
    : {
        active: e.active,
        since: 0,
        reveal: (i) => ITEM_START + i * ITEM_GAP,
      };
  const body = {
    steps: <Steps e={e} beat={beat} accent={accent} k={k} />,
    slider: <Slider e={e} accent={accent} theme={theme} k={k} />,
    stat: <Stat e={e} accent={accent} theme={theme} k={k} />,
    icons: (
      <Icons
        e={e}
        beat={beat}
        accent={accent}
        theme={theme}
        k={k}
        assets={assets}
      />
    ),
    list: <List e={e} beat={beat} accent={accent} theme={theme} k={k} />,
    chips: <Chips e={e} beat={beat} accent={accent} theme={theme} k={k} />,
    quote: <Quote e={e} accent={accent} k={k} />,
    title: <Title e={e} accent={accent} theme={theme} k={k} />,
  }[e.template];

  const centred = (top: string) => (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top,
        translate: "-50% -50%",
        scale: interpolate(enter, [0, 1], [0.94, 1]),
      }}
    >
      {body}
    </div>
  );

  if (e.scene === "overlay")
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        {centred(`${e.y * 100}%`)}
      </AbsoluteFill>
    );

  if (e.scene === "dim")
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill
          style={{
            backdropFilter: `blur(${interpolate(enter, [0, 1], [0, 18 * k])}px)`,
            backgroundColor: `rgba(4,6,16,${interpolate(enter, [0, 1], [0, 0.6])})`,
          }}
        />
        {centred(`${e.y * 100}%`)}
      </AbsoluteFill>
    );

  if (e.scene === "split") {
    // Graphic on top, the speaker below, framed on the face.
    const s = tracks.face[from + frame] ?? tracks.face[from];
    const fy = s ? s[1] : 0.38;
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "52%",
            overflow: "hidden",
            translate: `0 ${interpolate(enter, [0, 1], [-height * 0.52, 0])}px`,
          }}
        >
          <Backdrop scene="dark" accent={accent} />
          {centred("50%")}
        </div>
        {video ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "48%",
              overflow: "hidden",
              borderTop: `${3 * k}px solid ${accent}`,
            }}
          >
            <Video
              src={staticFile(video)}
              muted
              trimBefore={from}
              objectFit="cover"
              style={{
                width: "100%",
                height: "100%",
                objectPosition: `50% ${Math.round(fy * 100)}%`,
              }}
            />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        opacity: fade * enter,
        scale: interpolate(enter, [0, 1], [1.05, 1]),
      }}
    >
      <Backdrop scene={e.scene} accent={accent} />
      {centred("44%")}
    </AbsoluteFill>
  );
};
