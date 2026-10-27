import { loadFont as loadAbyssinica } from "@remotion/google-fonts/AbyssinicaSIL";
import { loadFont as loadAgbalumo } from "@remotion/google-fonts/Agbalumo";
import { loadFont as loadMenbere } from "@remotion/google-fonts/Menbere";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import {
  loadFont as loadNoto,
  loadVariableFont as loadNotoVariable,
} from "@remotion/google-fonts/NotoSansEthiopic";
import { ARABIC_FONT } from "./fonts";
import type { Plan } from "./types";

// Caption typefaces that carry both Ethiopic (Amharic) and Latin letters. Mirrors CAPTION_FONTS in shorts.py.
export type CaptionFontId = NonNullable<Plan["caption_font"]>;
export type CaptionFace = {
  family: string;
  weight: number;
  stretch?: string;
  /** Font size multiplier: some faces draw Ethiopic smaller or larger at the same size. */
  scale: number;
};

const LOADERS: Record<Exclude<CaptionFontId, "classic">, () => CaptionFace> = {
  noto_black: () => ({
    family: loadNoto("normal", {
      weights: ["900"],
      subsets: ["ethiopic", "latin"],
    }).fontFamily,
    weight: 900,
    scale: 1,
  }),
  noto_condensed: () => ({
    // The variable font's narrowest width (62.5%): Ethiopic narrows ~10%, Latin much more.
    family: loadNotoVariable("normal", { subsets: ["ethiopic", "latin"] })
      .fontFamily,
    weight: 900,
    stretch: "62.5%",
    scale: 1,
  }),
  noto_bold: () => ({
    family: loadNoto("normal", {
      weights: ["800"],
      subsets: ["ethiopic", "latin"],
    }).fontFamily,
    weight: 800,
    scale: 1,
  }),
  wide: () => ({
    // Wide geometric Latin (Montserrat) with Noto's Ethiopic for Amharic letters, like big creator titles.
    family: `${loadMontserrat("normal", { weights: ["800"], subsets: ["latin"] }).fontFamily}, ${
      loadNoto("normal", { weights: ["800"], subsets: ["ethiopic", "latin"] }).fontFamily
    }`,
    weight: 800,
    scale: 1,
  }),
  menbere: () => ({
    family: loadMenbere("normal", {
      weights: ["700"],
      subsets: ["ethiopic", "latin"],
    }).fontFamily,
    weight: 700,
    scale: 1.02,
  }),
  agbalumo: () => ({
    family: loadAgbalumo("normal", {
      weights: ["400"],
      subsets: ["ethiopic", "latin"],
    }).fontFamily,
    weight: 400,
    scale: 1,
  }),
  abyssinica: () => ({
    family: loadAbyssinica("normal", {
      weights: ["400"],
      subsets: ["ethiopic", "latin"],
    }).fontFamily,
    weight: 400,
    scale: 1.1,
  }),
};

const loaded = new Map<string, CaptionFace>();

/** The chosen caption face, loaded on first use; null means each preset keeps its own fonts. */
export const captionFace = (id: Plan["caption_font"]): CaptionFace | null => {
  if (!id || id === "classic") return null;
  const load = LOADERS[id] ?? LOADERS.noto_black;
  if (!loaded.has(id)) loaded.set(id, load());
  const face = loaded.get(id)!;
  return {
    ...face,
    family: `${face.family}, "Noto Sans Ethiopic", ${ARABIC_FONT}, "Geeza Pro", sans-serif`,
  };
};

/**
 * The caption letter case applied to the text itself, for styles that draw every letter in its own box:
 * there, CSS "capitalize" sees each letter as a new word and would capitalize all of them.
 */
export const caseText = (text: string, plan: Plan) =>
  plan.caption_case === "upper"
    ? text.toUpperCase()
    : plan.caption_case === "spoken"
      ? text
      : text.replace(/(^|[\s\-–—"'(“])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());

/** Letter case for caption styles that used to force ALL CAPS: Capitalized by default (Ethiopic has no case). */
export const letterCase = (plan: Plan): React.CSSProperties["textTransform"] =>
  plan.caption_case === "upper"
    ? "uppercase"
    : plan.caption_case === "spoken"
      ? "none"
      : "capitalize";
