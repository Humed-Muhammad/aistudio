import { Fragment } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mix, onAccent } from "./colors";
import { Icon, ICON_NAMES } from "./film/icons";
import { useMedia } from "./media";
import { Push } from "./Push";
import type { ShortEvent, Tracks } from "./types";

// Card items appear one after another; shorts.py uses the same numbers to time the sounds.
export const ITEM_START = 8;
export const ITEM_GAP = 6;
const EXIT = 7;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

import { accentCss, kitFor, type Kit, type Theme } from "./graphicKits";

/** "Reserve your *visual effects*": starred words get the style's accent treatment (serif, colour, marker…). */
const Headline: React.FC<{
  text: string;
  accent: string;
  theme: Theme;
  size: number;
}> = ({ text, accent, theme, size }) => {
  const parts = text.split(/(\*[^*]+\*)/).filter(Boolean);
  return (
    <div
      style={{
        textAlign: "center",
        lineHeight: 1.08,
        color: theme.ink ?? theme.text,
        fontFamily: theme.head,
        fontWeight: theme.headWeight,
        fontSize: size * 0.8 * theme.type,
        letterSpacing: theme.tracking,
        textTransform: theme.upper ? "uppercase" : undefined,
        textWrap: "balance",
      }}
    >
      {parts.map((p, i) =>
        p.startsWith("*") ? (
          <span
            key={i}
            style={accentCss(theme, accent, size * 0.8 * theme.type)}
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

/** Compare texts ignoring case, stars and punctuation (a headline that just repeats the step is hidden). */
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

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
  theme: Theme;
  k: number;
}> = ({ e, beat, accent, theme, k }) => {
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
  // Dots and the step name sit on one panel in the style's surface, so they read over any footage (white clothes too).
  const ink = theme.text;
  const faint = (alpha: string) =>
    /^#[\da-f]{6}$/i.test(ink) ? ink + alpha : ink;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22 * k,
        padding: `${24 * k}px ${34 * k}px ${30 * k}px`,
        borderRadius: 44 * k * theme.radius,
        background:
          theme.card === "transparent" ? "rgba(12,14,22,.68)" : theme.card,
        backdropFilter: theme.blur,
        border: `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`,
        boxShadow: theme.shadow,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
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
                    background: faint("38"),
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: ink,
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
                  fontFamily: theme.body,
                  fontWeight: 700,
                  fontSize: 28 * k * theme.type,
                  color: done ? onAccent(ink) : faint("D9"),
                  background: done ? ink : "transparent",
                  border: `${3 * k}px solid ${done ? ink : faint("8C")}`,
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
        <div style={{ textAlign: "center" }}>
          {e.text && norm(e.text) !== norm(now) ? (
            <div
              style={{
                fontFamily: theme.body,
                fontWeight: 600,
                fontSize: 40 * k * theme.type,
                color: theme.sub,
              }}
            >
              {e.text.replace(/\*/g, "")}
            </div>
          ) : null}
          {now ? (
            <div
              key={active}
              style={{
                fontFamily: theme.head,
                fontWeight: theme.headWeight,
                textTransform: theme.upper ? "uppercase" : undefined,
                color: ink,
                fontSize: 78 * k * theme.type,
                lineHeight: 1.05,
                opacity: label,
                filter: `blur(${(1 - label) * 8 * k}px)`,
                translate: `0 ${(1 - label) * 14 * k}px`,
              }}
            >
              <span style={accentCss(theme, accent, 78 * k * theme.type)}>
                {now}
              </span>
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
          borderRadius: 40 * k * theme.radius,
          background: theme.card,
          backdropFilter: theme.blur,
          border: `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`,
          boxShadow: theme.shadow,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: theme.body,
            fontWeight: 600,
            fontSize: 32 * k * theme.type,
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
  // Only growth figures (+240%, 3x) get the rising chart; "500 years" or a price is just the big counting number.
  const growth = /[%+↑×]|\dx\b/i.test(e.value);
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
        width: growth ? w + 100 * k : "max-content",
        minWidth: growth ? undefined : 560 * k,
        maxWidth: 960 * k,
        textAlign: growth ? undefined : "center",
        padding: `${44 * k}px ${50 * k}px`,
        borderRadius: 48 * k * theme.radius,
        background: theme.card,
        backdropFilter: theme.blur,
        border: `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`,
        boxShadow: `${theme.shadow}, 0 0 ${120 * k}px ${accent}33`,
        scale: interpolate(pop(frame, fps), [0, 1], [0.9, 1]),
      }}
    >
      {e.text ? (
        <div
          style={{
            fontFamily: theme.body,
            fontWeight: 600,
            fontSize: 30 * k * theme.type,
            color: theme.sub,
          }}
        >
          {e.text.replace(/\*/g, "")}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: theme.head,
          fontWeight: 800,
          fontSize: 130 * k * theme.type,
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
            fontFamily: theme.body,
            fontSize: 28 * k * theme.type,
            color: theme.sub,
            marginBottom: growth ? 24 * k : 0,
          }}
        >
          {e.label}
        </div>
      ) : null}
      {growth ? (
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
      ) : null}
    </div>
  );
};

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Icon from an item: "car Label" draws a named icon (motion/src/film/icons.tsx), else an uploaded image, "emoji Label"
 * or a letter tile. A leading - crosses the item out (what not to do), a leading + ticks it.
 */
const parseIcon = (raw: string, assets: string[]) => {
  const mark = raw.startsWith("-") ? "no" : raw.startsWith("+") ? "yes" : null;
  const item = mark ? raw.slice(1).trim() : raw;
  if (IMAGE.test(item))
    return assets.includes(item)
      ? { image: item, label: "", mark }
      : { glyph: item.slice(0, 1).toUpperCase(), label: "", mark };
  const [first, ...rest] = item.split(" ");
  if (ICON_NAMES.includes(first.toLowerCase()))
    return { name: first.toLowerCase(), label: rest.join(" "), mark };
  if (!/^[\p{L}\p{N}]/u.test(first))
    return { glyph: first, label: rest.join(" "), mark };
  return { glyph: item.slice(0, 2), label: item, mark };
};

const NO = "#FF5C5C";
const YES = "#3DDC97";

const Icons: React.FC<{
  e: ShortEvent;
  beat: Beat;
  accent: string;
  theme: Theme;
  k: number;
  assets: string[];
}> = ({ e, beat, accent, theme, k, assets }) => {
  const frame = useCurrentFrame();
  const media = useMedia();
  const { fps } = useVideoConfig();
  const n = e.items.length;
  const size = (n > 3 ? 170 : 210) * k;
  const surface =
    theme.card === "transparent" ? "rgba(12,14,22,.55)" : theme.card;
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
          const at = beat.reveal(i);
          const s = pop(frame, fps, at);
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
          // The strike draws across a crossed-out item just after it lands; a tick badge pops on a ticked one.
          const strike = interpolate(frame, [at + 7, at + 15], [0, 1], {
            ...clamp,
            easing: Easing.out(Easing.cubic),
          });
          const tick = pop(frame, fps, at + 7);
          const lit = current && icon.mark !== "no";
          const ink = lit ? onAccent(accent) : theme.text;
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
                  position: "relative",
                  width: size,
                  height: size,
                  borderRadius: size * 0.26 * theme.radius,
                  display: "grid",
                  placeItems: "center",
                  background: lit
                    ? `linear-gradient(150deg, ${accent}, ${mix(accent, "#000000", 0.35)})`
                    : surface,
                  backdropFilter: lit ? undefined : theme.blur,
                  border: `${2 * k * (theme.line ?? 1)}px solid ${lit ? "rgba(255,255,255,.55)" : theme.border}`,
                  boxShadow: lit
                    ? `0 0 ${60 * k}px ${accent}88, inset 0 ${8 * k}px ${18 * k}px rgba(255,255,255,.3)`
                    : theme.shadow,
                  fontSize: size * 0.5 * theme.type,
                  fontFamily: theme.head,
                  fontWeight: 800,
                  color: ink,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    borderRadius: "inherit",
                    opacity: icon.mark === "no" ? 1 - strike * 0.3 : 1,
                  }}
                >
                  {"image" in icon && icon.image ? (
                    <Img
                      src={media(`assets/${icon.image}`)}
                      style={{
                        width: "72%",
                        height: "72%",
                        objectFit: "contain",
                      }}
                    />
                  ) : "name" in icon && icon.name ? (
                    <Icon
                      name={icon.name}
                      size={size * 0.52}
                      color={ink}
                      stroke={1.75}
                    />
                  ) : (
                    icon.glyph
                  )}
                </div>
                {icon.mark === "no" ? (
                  <svg
                    viewBox="0 0 100 100"
                    style={{
                      position: "absolute",
                      inset: 0,
                      overflow: "visible",
                      filter: `drop-shadow(0 ${3 * k}px ${8 * k}px rgba(0,0,0,.45))`,
                    }}
                  >
                    <line
                      x1={16}
                      y1={16}
                      x2={16 + 68 * strike}
                      y2={16 + 68 * strike}
                      stroke={NO}
                      strokeWidth={9}
                      strokeLinecap="round"
                      opacity={strike > 0 ? 1 : 0}
                    />
                  </svg>
                ) : null}
                {icon.mark === "yes" ? (
                  <div
                    style={{
                      position: "absolute",
                      right: -size * 0.12,
                      top: -size * 0.12,
                      width: size * 0.38,
                      height: size * 0.38,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: YES,
                      boxShadow: `0 ${6 * k}px ${16 * k}px rgba(0,0,0,.35)`,
                      scale: tick,
                    }}
                  >
                    <Icon
                      name="check"
                      size={size * 0.24}
                      color="#06281A"
                      stroke={3}
                    />
                  </div>
                ) : null}
              </div>
              {icon.label ? (
                <div
                  style={{
                    fontFamily: theme.body,
                    fontWeight: 700,
                    fontSize: 34 * k * theme.type,
                    color: theme.ink ?? theme.text,
                    textShadow: `0 ${2 * k}px ${12 * k}px rgba(0,0,0,.55)`,
                    opacity: icon.mark === "no" ? 1 - strike * 0.35 : 1,
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
              borderRadius: 28 * k * theme.radius,
              background: theme.card,
              backdropFilter: theme.blur,
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
                fontFamily: theme.body,
                fontWeight: 700,
                fontSize: 26 * k * theme.type,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                fontFamily: theme.body,
                fontWeight: 600,
                fontSize: 38 * k * theme.type,
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
              borderRadius: 26 * k * theme.radius,
              background: theme.card,
              backdropFilter: theme.blur,
              border: `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`,
              boxShadow: theme.shadow,
              fontFamily: theme.body,
              fontWeight: 700,
              fontSize: 40 * k * theme.type,
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
  theme: Theme;
  k: number;
}> = ({ e, accent, theme, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(frame, fps);
  return (
    <div
      style={{
        width: 900 * k,
        padding: `${34 * k}px ${44 * k}px`,
        borderRadius: 18 * k * theme.radius,
        background: theme.card,
        backdropFilter: theme.blur,
        border: `${3 * k}px solid ${accent}`,
        boxShadow: `0 0 ${50 * k}px ${accent}55, 0 ${20 * k}px ${60 * k}px rgba(0,0,0,.5)`,
        textAlign: "center",
        opacity: s,
        translate: `0 ${interpolate(s, [0, 1], [30 * k, 0])}px`,
      }}
    >
      <div
        style={{
          fontFamily: theme.body,
          fontWeight: 600,
          fontSize: 42 * k * theme.type,
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
            fontFamily: theme.body,
            fontSize: 26 * k * theme.type,
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
            fontFamily: theme.body,
            fontWeight: 700,
            fontSize: 26 * k * theme.type,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: theme.inkSub ?? theme.sub,
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

/**
 * Progress that almost finishes, then stalls: the bar climbs to `value`%, slows, drains a little and
 * turns grey while the status (`label`, *stars* for the accent) fades in. For "I never finish" moments.
 */
const Progress: React.FC<{
  e: ShortEvent;
  accent: string;
  theme: Theme;
  k: number;
  duration: number;
}> = ({ e, accent, theme, k, duration }) => {
  const frame = useCurrentFrame();
  const target = Math.min(100, Math.max(1, parseFloat(e.value) || 92));
  const stallAt = Math.round(duration * 0.55);
  const climb = interpolate(frame, [6, stallAt], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  });
  const stall = interpolate(frame, [stallAt, stallAt + 18], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const pct = target * climb - target * 0.08 * stall;
  const w = 760 * k;
  const fill = `color-mix(in srgb, ${accent} ${Math.round((1 - stall) * 100)}%, #6b7080)`;
  const status = interpolate(frame, [stallAt + 8, stallAt + 20], [0, 1], clamp);
  return (
    <div
      style={{
        width: w + 100 * k,
        padding: `${44 * k}px ${50 * k}px`,
        borderRadius: 44 * k * theme.radius,
        background: theme.card,
        backdropFilter: theme.blur,
        border: `${1.5 * k * (theme.line ?? 1)}px solid ${theme.border}`,
        boxShadow: theme.shadow,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: theme.body,
          color: theme.text,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 34 * k * theme.type,
            color: theme.sub,
          }}
        >
          {e.text.replace(/\*/g, "")}
        </span>
        <span
          style={{
            fontFamily: theme.head,
            fontWeight: 800,
            fontSize: 76 * k * theme.type,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 22 * k,
          marginTop: 26 * k,
          borderRadius: 99,
          background: "rgba(130,140,170,.22)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: (pct / 100) * w,
            borderRadius: 99,
            background: fill,
            boxShadow: `0 0 ${24 * k * (1 - stall)}px ${accent}`,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22 * k,
          marginTop: 30 * k,
          opacity: status,
          translate: `0 ${(1 - status) * 12 * k}px`,
        }}
      >
        <div style={{ display: "flex", gap: 8 * k }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: 12 * k,
                height: 40 * k,
                borderRadius: 4 * k * theme.radius,
                background: theme.sub,
              }}
            />
          ))}
        </div>
        {e.label ? (
          <Headline
            text={e.label}
            accent={accent}
            theme={theme}
            size={58 * k}
          />
        ) : null}
      </div>
    </div>
  );
};

/** Full-screen scene background from the graphic style, with a slow drift so it is never a still frame. */
const Backdrop: React.FC<{ scene: ShortEvent["scene"]; kit: Kit }> = ({
  scene,
  kit,
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 60) * 1.5;
  return (
    <AbsoluteFill
      style={{
        background: scene === "light" ? kit.scene.light : kit.scene.dark,
        backgroundPosition: `${drift}% 0`,
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
  /** Graphic style id (plan.graphics_style). */
  style?: string;
};

/** Motion-graphic card. Rendered inside a Sequence, so frame 0 is its start. */
export const Card: React.FC<Props> = ({
  event: e,
  duration,
  accent: videoAccent,
  from,
  video,
  tracks,
  assets,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = width / 1080;
  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 9,
  });
  const fade = interpolate(frame, [duration - EXIT, duration], [1, 0], clamp);
  const kit = kitFor(style);
  // The creator's colours for this card win over the style's and the video's.
  const accent = e.accent || videoAccent;
  const styled = e.scene === "light" ? kit.light : kit.dark;
  const theme = e.ink
    ? {
        ...styled,
        text: e.ink,
        ink: e.ink,
        sub: e.ink + "BF",
        inkSub: e.ink + "BF",
      }
    : styled;
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
    steps: <Steps e={e} beat={beat} accent={accent} theme={theme} k={k} />,
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
    quote: <Quote e={e} accent={accent} theme={theme} k={k} />,
    title: <Title e={e} accent={accent} theme={theme} k={k} />,
    progress: (
      <Progress e={e} accent={accent} theme={theme} k={k} duration={duration} />
    ),
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

  // Split and full-screen scenes push the speaker video out of the way, animated in and out.
  const share = e.scene === "split" ? 0.52 : 1;
  const across = e.side === "left" || e.side === "right";
  return (
    <Push
      side={e.side}
      share={share}
      duration={duration}
      from={from}
      video={video}
      tracks={tracks}
      accent={accent}
      backdrop={kit.scene.dark}
    >
      <Backdrop scene={e.scene === "light" ? "light" : "dark"} kit={kit} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: share < 1 && !across ? "50%" : "44%",
          translate: "-50% -50%",
          scale: share < 1 && across ? 0.6 : 1,
        }}
      >
        {body}
      </div>
    </Push>
  );
};
