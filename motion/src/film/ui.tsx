import { Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { accentCss, type Theme } from "../graphicKits";
import { mix, onAccent } from "../colors";
import { useMedia } from "../media";
import { EASE_IN_OUT, EASE_OUT, Words } from "./motion";
import type { SceneProps } from "./types";

// Drawing kit for scenes: realistic app surfaces, device frames, cursor, buttons, logo mark and the stage layout.
// Everything is drawn in code from field values; designs are made for a 1080 short side (multiply px by k).

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Colours of a real-looking app screen (light or dark), with the film's accent for actions. */
export const appColors = (mode: "dark" | "light", accent: string) =>
  mode === "dark"
    ? { bg: "#0d0f14", surface: "#161922", surface2: "#1e2230", text: "#f4f6fa", sub: "#98a1b2", line: "rgba(255,255,255,.08)", accent, on: onAccent(accent), soft: mix(accent, "#161922", 0.78), shadow: "0 40px 100px rgba(0,0,0,.55), 0 4px 14px rgba(0,0,0,.35)" }
    : { bg: "#f3f4f7", surface: "#ffffff", surface2: "#f2f3f6", text: "#0e1116", sub: "#6b7280", line: "rgba(15,20,30,.08)", accent, on: onAccent(accent), soft: mix(accent, "#ffffff", 0.86), shadow: "0 40px 90px rgba(25,35,70,.20), 0 3px 10px rgba(25,35,70,.08)" };
export type App = ReturnType<typeof appColors>;

/** Type on app screens: clean UI sans, Ethiopic-ready. */
export const APP_FONT = "Inter, 'Noto Sans Ethiopic', 'Geeza Pro', sans-serif";

/** Light or dark for app screens: the theme's text colour tells which surfaces it was made for. */
export const modeOf = (theme: Theme): "dark" | "light" => (onAccent(theme.ink ?? theme.text) === "#ffffff" ? "light" : "dark");

/** Headline type in the film's graphic style. */
export const headline = (theme: Theme, size: number, color?: string): React.CSSProperties => ({
  fontFamily: theme.head,
  fontWeight: theme.headWeight,
  fontSize: size,
  lineHeight: 1.06,
  letterSpacing: theme.tracking,
  textTransform: theme.upper ? "uppercase" : undefined,
  color: color ?? theme.ink ?? theme.text,
  textWrap: "balance",
  margin: 0,
});

/** Body type in the film's graphic style. */
export const body = (theme: Theme, size: number, color?: string): React.CSSProperties => ({
  fontFamily: theme.body,
  fontWeight: 500,
  fontSize: size,
  lineHeight: 1.35,
  color: color ?? theme.inkSub ?? theme.sub,
  textWrap: "pretty",
  margin: 0,
});

export const accentWord = (theme: Theme, accent: string, size: number) => accentCss(theme, accent, size);

/** Font size that fits text of this length: base up to fits characters, smaller beyond (never under 55 %). */
export const fitSize = (text: string, base: number, fits: number) => base * Math.max(0.55, Math.min(1, fits / Math.max(1, [...text.replace(/\*/g, "")].length)));

/**
 * The scene's safe area, laid out for its shape: tall films keep clear of the platform buttons at the bottom
 * and the right; wide films get room for two columns.
 */
export const Stage: React.FC<{
  shape: SceneProps["shape"];
  k: number;
  children: React.ReactNode;
  align?: "center" | "start";
  /** row: side by side on wide films (stacked on tall and square). */
  row?: boolean;
  gap?: number;
  style?: React.CSSProperties;
}> = ({ shape, k, children, align = "center", row, gap = 48, style }) => {
  const pad = shape === "tall" ? `${230 * k}px ${86 * k}px ${380 * k}px` : shape === "wide" ? `${100 * k}px ${150 * k}px` : `${110 * k}px ${96 * k}px`;
  const side = row && shape === "wide";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: pad,
        display: "flex",
        flexDirection: side ? "row" : "column",
        alignItems: align === "center" ? "center" : side ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: align === "center" && !side ? "center" : "left",
        gap: gap * k,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A small label above a headline: a pill in the accent's soft tint. */
export const Kicker: React.FC<{ text: string; theme: Theme; accent: string; k: number; icon?: React.ReactNode }> = ({ text, theme, accent, k, icon }) =>
  text ? (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12 * k,
        padding: `${12 * k}px ${26 * k}px`,
        borderRadius: 999,
        background: `${accent}22`,
        border: `${2 * k}px solid ${accent}55`,
        color: modeOf(theme) === "dark" ? mix(accent, "#ffffff", 0.35) : mix(accent, "#000000", 0.35),
        fontFamily: theme.body,
        fontWeight: 700,
        fontSize: 30 * k,
        letterSpacing: "0.02em",
        textTransform: theme.upper ? "uppercase" : undefined,
      }}
    >
      {icon}
      {text}
    </div>
  ) : null;

/** A phone with a real screen inside: bezel, island, glass highlight and a soft shadow. */
export const Phone: React.FC<{ width: number; k: number; app: App; children: React.ReactNode; style?: React.CSSProperties; time?: string }> = ({
  width,
  k,
  app,
  children,
  style,
  time = "9:41",
}) => {
  const h = width * 2.05;
  const bezel = width * 0.035;
  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: width * 0.15,
        padding: bezel,
        background: "linear-gradient(145deg, #2a2d34, #0b0c0f 45%, #24262c)",
        boxShadow: `${app.shadow}, inset 0 0 0 ${2 * k}px rgba(255,255,255,.12)`,
        position: "relative",
        flex: "none",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: width * 0.12, overflow: "hidden", background: app.bg, fontFamily: APP_FONT, color: app.text }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: width * 0.13, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${width * 0.09}px`, color: app.text, fontWeight: 700, fontSize: width * 0.04, zIndex: 3 }}>
          <span>{time}</span>
          <span style={{ display: "flex", gap: width * 0.012, alignItems: "flex-end" }}>
            {[0.35, 0.55, 0.75, 1].map((s, i) => (
              <i key={i} style={{ width: width * 0.009, height: width * 0.03 * s, borderRadius: 2, background: app.text }} />
            ))}
            <i style={{ width: width * 0.055, height: width * 0.026, borderRadius: width * 0.008, border: `${Math.max(1, width * 0.003)}px solid ${app.text}`, marginLeft: width * 0.015, opacity: 0.9 }} />
          </span>
        </div>
        <div style={{ position: "absolute", top: width * 0.03, left: "50%", translate: "-50% 0", width: width * 0.3, height: width * 0.085, borderRadius: 999, background: "#000", zIndex: 4 }} />
        <div style={{ position: "absolute", inset: 0, paddingTop: width * 0.15 }}>{children}</div>
      </div>
      {/* Glass highlight across the screen. */}
      <div style={{ position: "absolute", inset: bezel, borderRadius: width * 0.12, background: "linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 32%)", pointerEvents: "none" }} />
    </div>
  );
};

/** A browser window: traffic lights, an address bar and the page. */
export const Browser: React.FC<{ width: number; height: number; k: number; app: App; url: string; children: React.ReactNode; typed?: number; style?: React.CSSProperties }> = ({
  width,
  height,
  k,
  app,
  url,
  children,
  typed = 1,
  style,
}) => {
  const bar = 70 * k;
  const shown = url.slice(0, Math.round(url.length * typed));
  return (
    <div style={{ width, height, borderRadius: 26 * k, overflow: "hidden", background: app.surface, boxShadow: `${app.shadow}, 0 0 0 ${1.5 * k}px ${app.line}`, flex: "none", ...style }}>
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: 12 * k, padding: `0 ${26 * k}px`, background: app.surface2, borderBottom: `${1.5 * k}px solid ${app.line}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <i key={c} style={{ width: 18 * k, height: 18 * k, borderRadius: "50%", background: c }} />
        ))}
        <div style={{ marginLeft: 22 * k, flex: 1, height: 42 * k, borderRadius: 999, background: app.surface, display: "flex", alignItems: "center", padding: `0 ${22 * k}px`, color: app.sub, fontFamily: APP_FONT, fontSize: 24 * k, gap: 10 * k, border: `${1.5 * k}px solid ${app.line}` }}>
          <svg width={18 * k} height={18 * k} viewBox="0 0 24 24" fill="none" stroke={app.sub} strokeWidth={2.4}>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {shown}
          {typed < 1 ? <i style={{ width: 2 * k, height: 26 * k, background: app.accent }} /> : null}
        </div>
      </div>
      <div style={{ position: "relative", height: height - bar, background: app.bg }}>{children}</div>
    </div>
  );
};

/** A surface card (app style). */
export const Surface: React.FC<{ app: App; k: number; children: React.ReactNode; style?: React.CSSProperties; radius?: number }> = ({ app, k, children, style, radius = 28 }) => (
  <div style={{ background: app.surface, borderRadius: radius * k, boxShadow: `0 ${18 * k}px ${44 * k}px rgba(20,30,60,${app.bg === "#0d0f14" ? 0.45 : 0.1}), 0 0 0 ${1.5 * k}px ${app.line}`, color: app.text, ...style }}>{children}</div>
);

/** A primary button; pressed 0→1 squeezes it as a tap lands. */
export const Button: React.FC<{ label: string; app: App; k: number; pressed?: number; size?: number; style?: React.CSSProperties; done?: boolean }> = ({ label, app, k, pressed = 0, size = 34, style, done }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12 * k,
      padding: `${size * 0.62 * k}px ${size * 1.3 * k}px`,
      borderRadius: 999,
      background: `linear-gradient(180deg, ${mix(app.accent, "#ffffff", 0.12)}, ${app.accent})`,
      color: app.on,
      fontFamily: APP_FONT,
      fontWeight: 700,
      fontSize: size * k,
      boxShadow: `0 ${14 * k}px ${30 * k}px ${app.accent}55, inset 0 ${2 * k}px 0 rgba(255,255,255,.25)`,
      scale: 1 - Math.sin(Math.min(1, pressed) * Math.PI) * 0.07,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {done ? (
      <svg width={size * 0.9 * k} height={size * 0.9 * k} viewBox="0 0 24 24" fill="none" stroke={app.on} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ) : null}
    {label}
  </div>
);

/** A round check that draws itself (p 0→1). */
export const DrawCheck: React.FC<{ p: number; size: number; color: string; on?: string }> = ({ p, size, color, on = "#ffffff" }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", flex: "none" }}>
    <circle cx="24" cy="24" r="22" fill={color} opacity={Math.min(1, p * 2)} transform={`rotate(-90 24 24)`} />
    <path d="M14 25l7 7 14-15" fill="none" stroke={on} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={40} strokeDashoffset={40 * (1 - Math.max(0, p * 1.6 - 0.6))} />
  </svg>
);

/** Initials in a coloured circle (people in chats, reviews and lists). */
export const Avatar: React.FC<{ name: string; size: number; accent: string; style?: React.CSSProperties }> = ({ name, size, accent, style }) => {
  const letters = [...name.trim()].filter((c) => c.trim()).slice(0, 1).join("") + ([...(name.trim().split(/\s+/)[1] ?? "")][0] ?? "");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  const hues = [accent, mix(accent, "#ff7a59", 0.6), mix(accent, "#5eead4", 0.6), mix(accent, "#b79cff", 0.6), mix(accent, "#ff6fae", 0.5)];
  const c = hues[h % hues.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: `linear-gradient(145deg, ${mix(c, "#ffffff", 0.25)}, ${c})`, color: onAccent(c), fontFamily: APP_FONT, fontWeight: 800, fontSize: size * 0.4, ...style }}>
      {letters.toUpperCase()}
    </div>
  );
};

/** The brand mark: the uploaded logo when there is one, else the first letter on an accent tile. */
export const Logo: React.FC<{ brand: SceneProps["brand"]; size: number; accent: string; accent2: string; style?: React.CSSProperties }> = ({ brand, size, accent, accent2, style }) => {
  const media = useMedia();
  if (brand.logo) return <Img src={media(brand.logo)} style={{ height: size, width: "auto", maxWidth: size * 3, objectFit: "contain", flex: "none", ...style }} />;
  const letter = [...(brand.name.trim() || "•")][0];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: `linear-gradient(145deg, ${mix(accent, "#ffffff", 0.2)}, ${accent} 50%, ${accent2})`,
        boxShadow: `0 ${size * 0.18}px ${size * 0.4}px ${accent}55, inset 0 ${size * 0.03}px 0 rgba(255,255,255,.35)`,
        color: onAccent(accent),
        fontFamily: APP_FONT,
        fontWeight: 900,
        fontSize: size * 0.56,
        ...style,
      }}
    >
      {letter.toUpperCase()}
    </div>
  );
};

/** A mouse pointer that glides between points (frames, x, y in px) and clicks where a point says so. */
export const Cursor: React.FC<{ path: { at: number; x: number; y: number; click?: boolean }[]; k: number; color?: string }> = ({ path, k, color = "#ffffff" }) => {
  const frame = useCurrentFrame();
  if (!path.length || frame < path[0].at) return null;
  let x = path[0].x;
  let y = path[0].y;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (frame >= a.at) {
      const p = interpolate(frame, [a.at, b.at], [0, 1], { ...clamp, easing: EASE_IN_OUT });
      x = a.x + (b.x - a.x) * p;
      y = a.y + (b.y - a.y) * p;
    }
  }
  const click = path.find((p) => p.click && frame >= p.at && frame < p.at + 14);
  const c = click ? (frame - click.at) / 14 : 0;
  const appear = interpolate(frame, [path[0].at, path[0].at + 8], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 20, opacity: appear, pointerEvents: "none" }}>
      {click ? <div style={{ position: "absolute", left: -40 * k, top: -40 * k, width: 80 * k, height: 80 * k, borderRadius: "50%", border: `${4 * k}px solid ${color}`, opacity: 1 - c, scale: 0.4 + c }} /> : null}
      <svg width={54 * k} height={54 * k} viewBox="0 0 24 24" style={{ scale: click ? 1 - Math.sin(c * Math.PI) * 0.15 : 1, filter: `drop-shadow(0 ${4 * k}px ${8 * k}px rgba(0,0,0,.35))` }}>
        <path d="M4 2.5l15 9.2-6.6 1.4 3.9 7.3-2.9 1.5-3.9-7.3L4.6 19z" fill="#111" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** A fingertip tap for phone screens: a soft circle that presses where a point says so. */
export const Tap: React.FC<{ at: number; x: number; y: number; k: number }> = ({ at, x, y, k }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -8 || t > 18) return null;
  const show = interpolate(t, [-8, 0, 10, 18], [0, 1, 1, 0], clamp);
  const ring = interpolate(t, [0, 16], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 20, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: -34 * k, top: -34 * k, width: 68 * k, height: 68 * k, borderRadius: "50%", background: "rgba(255,255,255,.55)", border: `${3 * k}px solid rgba(255,255,255,.9)`, opacity: show, scale: t < 0 ? 1.2 : 1 - Math.sin(Math.min(1, t / 8) * Math.PI) * 0.2, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }} />
      <div style={{ position: "absolute", left: -60 * k, top: -60 * k, width: 120 * k, height: 120 * k, borderRadius: "50%", border: `${3 * k}px solid rgba(255,255,255,.7)`, opacity: t >= 0 ? 1 - ring : 0, scale: 0.4 + ring * 0.8 }} />
    </div>
  );
};

/** Typed text: how much of a string shows at this frame (characters per second), with a blinking caret. */
export const useTyped = (text: string, from: number, cps = 22) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = [...text];
  const n = Math.max(0, Math.min(chars.length, Math.floor(((frame - from) / fps) * cps)));
  return { text: chars.slice(0, n).join(""), done: n >= chars.length, caret: Math.floor(frame / 15) % 2 === 0 || n < chars.length };
};

/** Splits "a|b|c" list rows into their parts (blank parts become ""). */
export const parts = (row: string, n: number) => {
  const p = row.split("|").map((s) => s.trim());
  while (p.length < n) p.push("");
  return p;
};

/** A soft glow behind a hero element. */
export const Glow: React.FC<{ color: string; size: number; style?: React.CSSProperties; strength?: number }> = ({ color, size, style, strength = 0.5 }) => (
  <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: `radial-gradient(closest-side, ${color}${Math.round(strength * 255).toString(16).padStart(2, "0")}, transparent)`, pointerEvents: "none", ...style }} />
);

/** Eased 0→1 for a moment that happens once at a frame (a tap, a toast, a check). */
export const useAt = (at: number, frames = 16) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [at, at + frames], [0, 1], { ...clamp, easing: EASE_OUT });
};

/**
 * Layout for product scenes: the headline (word by word) and the device. Tall films stack them, headline on top;
 * square and wide films put the headline on the left. Without a caption the device is centred alone.
 */
export const ProductLayout: React.FC<{ shape: SceneProps["shape"]; k: number; theme: Theme; accent: string; caption: string; children: React.ReactNode; captionWidth?: number }> = ({
  shape,
  k,
  theme,
  accent,
  caption,
  children,
  captionWidth,
}) => {
  const tall = shape === "tall";
  const size = fitSize(caption, (tall ? 88 : shape === "wide" ? 96 : 66) * k, tall ? 26 : 22);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: tall ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: (tall ? 64 : 110) * k,
        padding: tall ? `${170 * k}px ${70 * k}px ${300 * k}px` : `${80 * k}px ${120 * k}px`,
      }}
    >
      {caption ? (
        <h2 style={{ ...headline(theme, size), maxWidth: (tall ? 900 : captionWidth ?? (shape === "wide" ? 760 : 420)) * k, textAlign: tall ? "center" : "left", flex: "none" }}>
          <Words text={caption} step={0} accentStyle={accentWord(theme, accent, size)} />
        </h2>
      ) : null}
      <div style={{ perspective: 2400 * k, flex: "none" }}>{children}</div>
    </div>
  );
};
