import { createContext, useContext } from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// The motion rules every scene follows, so even a one-line request moves like a designed film:
// 1. Overlap: each element starts before the one before it has finished (GAP < IN).
// 2. Ease out: things arrive fast and settle softly, never stop dead (EASE_OUT); exits ease in (EASE_IN).
// 3. Hierarchy: the most important element (step 0) moves first, then the rest in reading order.
// 4. Reading time: a scene holds still long enough to read (readSeconds; films.py checks every scene).
// 5. Consistency: the same kind of element always moves the same way (one ROLES preset per kind).

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Frames before the first element moves, between steps, for one entrance, and for the exit. */
export const LEAD = 6;
export const GAP = 5;
export const IN = 20;
export const OUT = 10;

/** The frame step i of a scene starts on (shared by the animation and the sound cues). */
export const beat = (i: number, gap = GAP) => LEAD + Math.max(0, i) * gap;

/** Seconds a viewer needs to read this text (about 3 words a second, at least a second). */
export const readSeconds = (text: string) => Math.max(1, text.split(/\s+/).filter(Boolean).length / 3);

export type Role = "title" | "text" | "card" | "chip" | "number" | "icon" | "ui" | "line" | "fade";

/** How each kind of element enters: offset in px (x, y), scale and blur at the start, and its easing. */
const ROLES: Record<Role, { x?: number; y?: number; scale?: number; blur?: number; rotate?: number; frames?: number; overshoot?: boolean }> = {
  title: { y: 18, blur: 8, frames: 18, overshoot: true },
  text: { y: 24, blur: 4 },
  card: { y: 46, scale: 0.94, frames: 24, overshoot: true },
  chip: { scale: 0.6, frames: 16, overshoot: true },
  number: { y: 30, scale: 0.9, blur: 6 },
  icon: { scale: 0.4, rotate: -12, frames: 18, overshoot: true },
  ui: { y: 70, scale: 0.97, frames: 26 },
  line: { frames: 22 },
  fade: { frames: 14 },
};


/** Scene facts the motion helpers need: length, whether elements exit by themselves, the size factor. */
export const SceneClock = createContext<{ durationInFrames: number; exits: boolean; k: number }>({ durationInFrames: 90, exits: true, k: 1 });

/**
 * Progress of an element: enter 0→1 from its step, exit 1→0 over the scene's last frames (when the scene exits
 * by itself), both eased. step can be fractional; delay adds frames.
 */
export const useMotion = (step = 0, role: Role = "text", delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { durationInFrames, exits } = useContext(SceneClock);
  const r = ROLES[role];
  const start = beat(step) + delay;
  const enter = interpolate(frame, [start, start + (r.frames ?? IN)], [0, 1], { ...clamp, easing: EASE_OUT });
  // Arrival with weight: a spring that overshoots about 4 % and settles (cards, chips, icons, titles).
  const travel = r.overshoot ? spring({ frame: frame - start, fps, config: { damping: 17, stiffness: 160, mass: 0.9 } }) : enter;
  // Exits run in the same order, quicker (2 frames apart), finishing just before the cut.
  const outStart = durationInFrames - OUT - 2 - Math.min(4, step) * 2;
  const exit = exits ? interpolate(frame, [outStart, outStart + OUT], [1, 0], { ...clamp, easing: EASE_IN }) : 1;
  return { enter, travel, exit, frame, start };
};

/** Style for an element of a given role at its step: the one shared motion for that kind of element. */
export const useEnter = (step = 0, role: Role = "text", delay = 0): React.CSSProperties => {
  const { k } = useContext(SceneClock);
  const { enter, travel: p, exit } = useMotion(step, role, delay);
  const r = ROLES[role];
  const gone = 1 - exit;
  const move = (v = 0) => v * k * (1 - p) - (role === "fade" ? 0 : gone * 16 * k);
  return {
    opacity: Math.min(enter * 1.4, 1) * exit,
    translate: `${move(r.x)}px ${role === "fade" ? 0 : (r.y ?? 0) * k * (1 - p) - gone * 22 * k}px`,
    scale: r.scale ? r.scale + (1 - r.scale) * p - gone * 0.03 : 1 - gone * 0.03,
    rotate: r.rotate ? `${r.rotate * (1 - p)}deg` : undefined,
    filter: r.blur || gone ? `blur(${((r.blur ?? 0) * (1 - enter) + gone * 6) * k}px)` : undefined,
    willChange: "transform, opacity",
  };
};

/** Wrap anything to give it its role's entrance (and exit) at a step. */
export const In: React.FC<{ step?: number; role?: Role; delay?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  step = 0,
  role = "text",
  delay = 0,
  style,
  children,
}) => <div style={{ ...useEnter(step, role, delay), ...style }}>{children}</div>;

/** A headline that builds word by word (Ethiopic-safe: splits on spaces), *starred* words in the accent. */
export const Words: React.FC<{ text: string; step?: number; every?: number; style?: React.CSSProperties; accentStyle?: React.CSSProperties }> = ({
  text,
  step = 0,
  every = 3,
  style,
  accentStyle,
}) => {
  const words = text.split(/\s+/).filter(Boolean);
  let starred = false;
  return (
    <span style={{ ...style }}>
      {words.map((w, i) => {
        // A starred run may end in punctuation: "*on time*," keeps the comma outside the accent.
        if (w.startsWith("*")) starred = true;
        const accent = starred;
        if (/\*[^\p{L}\p{N}]*$/u.test(w) && (w.length > 1 || !w.startsWith("*"))) starred = false;
        const clean = w.replace(/\*/g, "");
        return (
          <WordIn key={i} delay={i * every} step={step} style={accent ? accentStyle : undefined}>
            {clean}
            {i < words.length - 1 ? " " : ""}
          </WordIn>
        );
      })}
    </span>
  );
};

const WordIn: React.FC<{ step: number; delay: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ step, delay, style, children }) => {
  const s = useEnter(step, "title", delay);
  return <span style={{ display: "inline-block", whiteSpace: "pre", ...s, ...style }}>{children}</span>;
};

/** Count from 0 (or from) to the number inside a value like "1,200 ብር" or "98%", keeping the text around it. */
export const useCount = (value: string, step = 0, frames = 36, from = 0) => {
  const frame = useCurrentFrame();
  const m = value.match(/-?[\d,]*\.?\d+/);
  if (!m) return value;
  const target = Number(m[0].replace(/,/g, ""));
  const decimals = (m[0].split(".")[1] ?? "").length;
  const p = interpolate(frame, [beat(step), beat(step) + frames], [0, 1], { ...clamp, easing: EASE_OUT });
  const n = from + (target - from) * p;
  const shown = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return value.replace(m[0], m[0].includes(",") ? shown : shown.replace(/,/g, ""));
};

/** 0→1 over a stretch of the scene, eased: draw a line, fill a bar, move a cursor. */
export const useProgress = (from: number, frames: number, easing = EASE_IN_OUT) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [from, from + frames], [0, 1], { ...clamp, easing });
};

/** Slow drift for a whole scene (subtle life while text is read). */
export const useDrift = (amount = 1) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useContext(SceneClock);
  return interpolate(frame, [0, durationInFrames], [0, amount], clamp);
};
