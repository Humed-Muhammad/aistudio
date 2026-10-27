import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadEthiopic } from "@remotion/google-fonts/NotoSansEthiopic";
import { loadFont as loadSpace } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { ACCENT_FONT, HEADLINE_FONT } from "./fonts";
import { mix } from "./colors";

// Graphic styles for cards and text pops. Each style is a complete design language: fonts, type scale,
// surfaces, corners and how accent (*starred*) words look. Researched direction for 2026: big confident
// type, one focal element, purposeful motion; liquid glass for tech/AI; editorial serif; no neon.

const inter = loadInter("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin"],
}).fontFamily;
const ethiopic = loadEthiopic("normal", {
  weights: ["500", "700", "900"],
  subsets: ["ethiopic"],
}).fontFamily;
const space = loadSpace("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
}).fontFamily;
const mono = loadMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
}).fontFamily;
const eth = `${ethiopic}, "Geeza Pro"`;
const SANS = `${inter}, ${eth}, sans-serif`;

export type Theme = {
  text: string;
  sub: string;
  /** Card surface, chips and small labels, border, drop shadow. */
  card: string;
  chip: string;
  border: string;
  shadow: string;
  /** Text that sits on the video or scene rather than on a card (light-card styles need light text there). */
  ink?: string;
  inkSub?: string;
  /** Border weight multiplier (neo-brutal uses a heavy outline). */
  line?: number;
  /** backdrop-filter for card surfaces (frosted glass), or undefined. */
  blur?: string;
  head: string;
  body: string;
  headWeight: number;
  tracking: string;
  upper: boolean;
  /** Type and corner multipliers on the template's base sizes. */
  type: number;
  radius: number;
  accent: "serif" | "color" | "marker" | "underline" | "glow";
};

export type Kit = {
  name: string;
  dark: Theme;
  light: Theme;
  /** Full-screen scene backgrounds (dark / light scenes). */
  scene: { dark: string; light: string };
};

const base = { body: SANS, tracking: "-0.015em", upper: false };

export const KITS: Record<string, Kit> = {
  glass: {
    name: "Liquid glass",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.72)",
      // A light sheen over a smoked tint, so white and accent text still read over white clothes or bright rooms.
      card: "linear-gradient(160deg, rgba(255,255,255,.14), rgba(255,255,255,.03)), rgba(12,14,22,.68)",
      chip: "rgba(255,255,255,.16)",
      border: "rgba(255,255,255,.38)",
      shadow: "0 30px 80px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.5)",
      blur: "blur(28px) saturate(1.4)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.25,
      accent: "color",
    },
    light: {
      ...base,
      text: "#0f1115",
      sub: "rgba(15,17,21,.6)",
      card: "linear-gradient(160deg, rgba(255,255,255,.85), rgba(255,255,255,.6))",
      chip: "rgba(255,255,255,.75)",
      border: "rgba(255,255,255,.9)",
      shadow: "0 30px 70px rgba(30,40,80,.18), inset 0 1px 0 #fff",
      blur: "blur(24px) saturate(1.3)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.25,
      accent: "color",
    },
    scene: {
      dark: "radial-gradient(70% 45% at 30% 20%, #3b4a7a88, transparent 70%), radial-gradient(60% 40% at 80% 90%, #2c6f8a66, transparent 70%), linear-gradient(180deg, #0c1020, #05060c)",
      light:
        "radial-gradient(70% 50% at 25% 15%, #dfe8ff, transparent 70%), radial-gradient(60% 45% at 85% 90%, #ffe3dc, transparent 70%), #f4f5f8",
    },
  },
  bold: {
    name: "Bold block",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.7)",
      card: "#101114",
      chip: "#101114",
      border: "rgba(255,255,255,.08)",
      shadow: "0 22px 50px rgba(0,0,0,.45)",
      head: HEADLINE_FONT,
      headWeight: 900,
      tracking: "-0.02em",
      upper: true,
      type: 1.4,
      radius: 0.55,
      accent: "marker",
    },
    light: {
      ...base,
      text: "#101114",
      sub: "#4a4c55",
      card: "#ffffff",
      chip: "#ffffff",
      border: "rgba(0,0,0,.06)",
      shadow: "0 22px 50px rgba(0,0,0,.18)",
      head: HEADLINE_FONT,
      headWeight: 900,
      tracking: "-0.02em",
      upper: true,
      type: 1.4,
      radius: 0.55,
      accent: "marker",
    },
    scene: { dark: "#0b0c0f", light: "#f2f1ee" },
  },
  editorial: {
    name: "Editorial",
    dark: {
      ...base,
      text: "#f6f2ea",
      sub: "rgba(246,242,234,.65)",
      card: "rgba(20,19,17,.88)",
      chip: "rgba(20,19,17,.85)",
      border: "rgba(246,242,234,.16)",
      shadow: "0 30px 70px rgba(0,0,0,.4)",
      head: SANS,
      headWeight: 600,
      type: 1.25,
      radius: 0.35,
      accent: "serif",
    },
    light: {
      ...base,
      text: "#16140f",
      sub: "#6b665c",
      card: "#fbf8f2",
      chip: "#fbf8f2",
      border: "rgba(22,20,15,.1)",
      shadow: "0 24px 60px rgba(60,50,30,.16)",
      head: SANS,
      headWeight: 600,
      type: 1.25,
      radius: 0.35,
      accent: "serif",
    },
    scene: {
      dark: "linear-gradient(180deg, #1a1815, #0d0c0a)",
      light: "#f3efe6",
    },
  },
  minimal: {
    name: "Minimal",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.75)",
      card: "transparent",
      chip: "rgba(0,0,0,.28)",
      border: "transparent",
      shadow: "none",
      head: SANS,
      headWeight: 800,
      type: 1.45,
      radius: 1,
      accent: "underline",
    },
    light: {
      ...base,
      text: "#111216",
      sub: "#5d5f6b",
      card: "transparent",
      chip: "rgba(255,255,255,.7)",
      border: "transparent",
      shadow: "none",
      head: SANS,
      headWeight: 800,
      type: 1.45,
      radius: 1,
      accent: "underline",
    },
    scene: { dark: "#0d0e11", light: "#f5f5f3" },
  },
  tech: {
    name: "Tech",
    dark: {
      ...base,
      text: "#eef2f7",
      sub: "rgba(220,230,240,.62)",
      card: "linear-gradient(180deg, rgba(14,17,22,.92), rgba(8,10,13,.94))",
      chip: "rgba(14,17,22,.9)",
      border: "rgba(160,190,220,.22)",
      shadow: "0 26px 60px rgba(0,0,0,.5)",
      head: `${space}, ${eth}, sans-serif`,
      headWeight: 700,
      tracking: "-0.02em",
      type: 1.3,
      radius: 0.45,
      accent: "glow",
    },
    light: {
      ...base,
      text: "#0c0f14",
      sub: "#55606e",
      card: "#ffffff",
      chip: "#ffffff",
      border: "rgba(12,15,20,.1)",
      shadow: "0 22px 50px rgba(20,30,50,.14)",
      head: `${space}, ${eth}, sans-serif`,
      headWeight: 700,
      tracking: "-0.02em",
      type: 1.3,
      radius: 0.45,
      accent: "color",
    },
    scene: {
      dark: "linear-gradient(rgba(140,170,210,.06) 1px, transparent 1px) 0 0 / 60px 60px, linear-gradient(90deg, rgba(140,170,210,.06) 1px, transparent 1px) 0 0 / 60px 60px, radial-gradient(70% 50% at 50% 30%, #13202e, #07090c)",
      light:
        "linear-gradient(rgba(12,15,20,.05) 1px, transparent 1px) 0 0 / 60px 60px, linear-gradient(90deg, rgba(12,15,20,.05) 1px, transparent 1px) 0 0 / 60px 60px, #f4f6f8",
    },
  },
  brutal: {
    name: "Neo-brutal",
    dark: {
      ...base,
      ink: "#ffffff",
      inkSub: "rgba(255,255,255,.75)",
      text: "#0d0d0d",
      sub: "#3c3c3c",
      card: "#ffffff",
      chip: "rgba(14,14,18,.82)",
      border: "#0d0d0d",
      line: 3,
      shadow: "10px 10px 0 #0d0d0d",
      head: `${space}, ${eth}, sans-serif`,
      headWeight: 700,
      tracking: "-0.03em",
      type: 1.35,
      radius: 0.3,
      accent: "marker",
    },
    light: {
      ...base,
      text: "#0d0d0d",
      sub: "#3c3c3c",
      card: "#ffffff",
      chip: "#ffffff",
      border: "#0d0d0d",
      line: 3,
      shadow: "10px 10px 0 #0d0d0d",
      head: `${space}, ${eth}, sans-serif`,
      headWeight: 700,
      tracking: "-0.03em",
      type: 1.35,
      radius: 0.3,
      accent: "marker",
    },
    scene: { dark: "#1c1c1c", light: "#f1efe8" },
  },
  aurora: {
    name: "Aurora",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.8)",
      card: "linear-gradient(140deg, #5b3fd1 0%, #a2489e 55%, #ee7a5f 100%)",
      chip: "linear-gradient(140deg, #5b3fd1, #a2489e)",
      border: "rgba(255,255,255,.28)",
      shadow: "0 30px 70px rgba(70,30,120,.45)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.1,
      accent: "underline",
    },
    light: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.85)",
      card: "linear-gradient(140deg, #6a4fe0 0%, #b55aa8 55%, #f08a6e 100%)",
      chip: "linear-gradient(140deg, #6a4fe0, #b55aa8)",
      border: "rgba(255,255,255,.35)",
      shadow: "0 30px 70px rgba(90,50,140,.3)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.1,
      accent: "underline",
    },
    scene: {
      dark: "radial-gradient(70% 50% at 20% 20%, #5b3fd1aa, transparent 70%), radial-gradient(70% 50% at 85% 85%, #ee7a5f88, transparent 70%), #120c22",
      light:
        "radial-gradient(70% 50% at 20% 20%, #d9cdfc, transparent 70%), radial-gradient(70% 50% at 85% 85%, #fdd5c8, transparent 70%), #f7f3fb",
    },
  },
  candy: {
    name: "Candy",
    dark: {
      ...base,
      ink: "#ffffff",
      inkSub: "rgba(255,255,255,.75)",
      text: "#2a1f3d",
      sub: "#6b5a85",
      card: "linear-gradient(160deg, #ffe1f0 0%, #e6dcff 55%, #d6f1ff 100%)",
      chip: "rgba(14,14,18,.82)",
      border: "rgba(255,255,255,.9)",
      shadow: "0 24px 60px rgba(120,80,170,.3)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.7,
      accent: "color",
    },
    light: {
      ...base,
      text: "#2a1f3d",
      sub: "#6b5a85",
      card: "linear-gradient(160deg, #ffe1f0 0%, #e6dcff 55%, #d6f1ff 100%)",
      chip: "linear-gradient(160deg, #ffe1f0, #e6dcff)",
      border: "rgba(255,255,255,.9)",
      shadow: "0 24px 60px rgba(120,80,170,.2)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.7,
      accent: "color",
    },
    scene: {
      dark: "linear-gradient(160deg, #3a2d5c, #1f1834)",
      light: "linear-gradient(160deg, #fff0f7, #eef4ff)",
    },
  },
  noir: {
    name: "Noir",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.6)",
      card: "#000000",
      chip: "#000000",
      border: "rgba(255,255,255,.5)",
      shadow: "0 30px 80px rgba(0,0,0,.6)",
      head: SANS,
      headWeight: 500,
      tracking: "0.01em",
      type: 1.25,
      radius: 0,
      accent: "serif",
    },
    light: {
      ...base,
      text: "#000000",
      sub: "rgba(0,0,0,.55)",
      card: "#ffffff",
      chip: "#ffffff",
      border: "rgba(0,0,0,.6)",
      shadow: "0 30px 70px rgba(0,0,0,.18)",
      head: SANS,
      headWeight: 500,
      tracking: "0.01em",
      type: 1.25,
      radius: 0,
      accent: "serif",
    },
    scene: { dark: "#000000", light: "#ffffff" },
  },
  swiss: {
    name: "Swiss",
    dark: {
      ...base,
      text: "#ffffff",
      sub: "rgba(255,255,255,.7)",
      card: "#111111",
      chip: "#111111",
      border: "#111111",
      shadow: "none",
      head: HEADLINE_FONT,
      headWeight: 800,
      tracking: "-0.01em",
      upper: true,
      type: 1.35,
      radius: 0,
      accent: "color",
    },
    light: {
      ...base,
      text: "#111111",
      sub: "#555555",
      card: "#ffffff",
      chip: "#ffffff",
      border: "#ffffff",
      shadow: "none",
      head: HEADLINE_FONT,
      headWeight: 800,
      tracking: "-0.01em",
      upper: true,
      type: 1.35,
      radius: 0,
      accent: "color",
    },
    scene: { dark: "#111111", light: "#ebeae6" },
  },
  clay: {
    name: "Clay",
    dark: {
      ...base,
      ink: "#ffffff",
      inkSub: "rgba(255,255,255,.75)",
      text: "#2b2f36",
      sub: "#6c727c",
      card: "linear-gradient(145deg, #f3f4f6, #dcdfe4)",
      chip: "rgba(14,14,18,.82)",
      border: "rgba(255,255,255,.7)",
      shadow:
        "18px 18px 40px rgba(0,0,0,.28), -10px -10px 30px rgba(255,255,255,.18), inset 2px 2px 3px #fff, inset -3px -3px 6px rgba(0,0,0,.08)",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.4,
      accent: "color",
    },
    light: {
      ...base,
      text: "#2b2f36",
      sub: "#6c727c",
      card: "linear-gradient(145deg, #f6f7f9, #e2e5ea)",
      chip: "linear-gradient(145deg, #f6f7f9, #e2e5ea)",
      border: "rgba(255,255,255,.8)",
      shadow:
        "16px 16px 36px rgba(120,130,150,.35), -12px -12px 30px #ffffff, inset 2px 2px 3px #fff",
      head: SANS,
      headWeight: 800,
      type: 1.3,
      radius: 1.4,
      accent: "color",
    },
    scene: { dark: "#3a3e46", light: "#e8eaee" },
  },
};

export const MONO = `${mono}, ui-monospace, monospace`;
export const kitFor = (id?: string) => KITS[id ?? "glass"] ?? KITS.glass;

/** How a *starred* accent word looks in this style, at the given font size. */
export const accentCss = (
  theme: Theme,
  accent: string,
  size: number,
): React.CSSProperties => {
  switch (theme.accent) {
    case "serif":
      return {
        fontFamily: ACCENT_FONT,
        fontStyle: "italic",
        // Ethiopic has no italic: keep it upright instead of a fake slant (Latin uses the real italic face).
        fontSynthesis: "none",
        fontWeight: 400,
        fontSize: size * 1.3,
        color: accent,
        letterSpacing: 0,
        textTransform: "none",
      };
    case "marker":
      return {
        color: mix(accent, "#000000", 0.82),
        background: `linear-gradient(transparent 8%, ${accent} 8%, ${accent} 92%, transparent 92%)`,
        padding: "0 0.14em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      };
    case "underline":
      return {
        color: theme.text,
        backgroundImage: `linear-gradient(${accent}, ${accent})`,
        backgroundSize: "100% 0.12em",
        backgroundPosition: "0 92%",
        backgroundRepeat: "no-repeat",
      };
    case "glow":
      return {
        color: mix(accent, "#ffffff", 0.3),
        textShadow: `0 0 ${size * 0.25}px ${accent}aa, 0 0 ${size * 0.6}px ${accent}55`,
      };
    default:
      return { color: accent };
  }
};
