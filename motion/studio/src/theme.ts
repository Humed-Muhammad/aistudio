// Editor themes. Each is one set of color tokens (see styles.css for how they are used).
// To add a theme: add an entry here; nothing else changes.
export type Theme = {
  id: string;
  name: string;
  dark: boolean;
  tokens: Record<string, string>;
};

export const THEMES: Theme[] = [
  {
    id: "graphite",
    name: "Graphite + Yellow",
    dark: true,
    tokens: {
      bg: "#0F1012",
      panel: "#17181C",
      raised: "#222429",
      sunken: "#0B0C0E",
      border: "#2E3036",
      text: "#ECECEE",
      muted: "#8B8D94",
      accent: "#FFD60A",
      "on-accent": "#141414",
      danger: "#F0625A",
      ok: "#3FCF8E",
      video: "#3A6E5A",
      audio: "#4A5A8C",
      graphics: "#8C5A3A",
      captions: "#6A4A8C",
    },
  },
  {
    id: "black",
    name: "Pure black",
    dark: true,
    tokens: {
      bg: "#000000",
      panel: "#0D0D0D",
      raised: "#181818",
      sunken: "#000000",
      border: "#1F1F1F",
      text: "#FFFFFF",
      muted: "#7A7A7A",
      accent: "#FFD60A",
      "on-accent": "#000000",
      danger: "#FF5A52",
      ok: "#3FCF8E",
      video: "#2F5E4C",
      audio: "#3D4C7A",
      graphics: "#7A4C30",
      captions: "#5C3E7A",
    },
  },
  {
    id: "navy",
    name: "Warm navy",
    dark: true,
    tokens: {
      bg: "#0A0D1A",
      panel: "#111528",
      raised: "#1A1F38",
      sunken: "#070914",
      border: "#232A45",
      text: "#EEF0F8",
      muted: "#8790B0",
      accent: "#FFD60A",
      "on-accent": "#141414",
      danger: "#F0625A",
      ok: "#3FCF8E",
      video: "#2F6458",
      audio: "#45558F",
      graphics: "#8A5838",
      captions: "#634A92",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    dark: false,
    tokens: {
      bg: "#F4F4F6",
      panel: "#FFFFFF",
      raised: "#F0F0F3",
      sunken: "#E9E9EE",
      border: "#DEDFE4",
      text: "#16181F",
      muted: "#6F7380",
      accent: "#E0B400",
      "on-accent": "#141414",
      danger: "#D64545",
      ok: "#1F9D55",
      video: "#7FB8A2",
      audio: "#8FA0D6",
      graphics: "#D6A07E",
      captions: "#B096D6",
    },
  },
];

const KEY = "studio-theme";
const DEFAULT = "daylight";

export const savedTheme = (): string => {
  try {
    return localStorage.getItem(KEY) || DEFAULT;
  } catch {
    return DEFAULT;
  }
};

export const applyTheme = (id: string) => {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT)!;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens))
    root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = theme.dark ? "dark" : "light";
  root.dataset.theme = theme.id;
  try {
    localStorage.setItem(KEY, theme.id);
  } catch {
    // private window: the theme still applies for this visit
  }
};
