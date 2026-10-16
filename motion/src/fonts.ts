import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadEthiopic } from "@remotion/google-fonts/NotoSansEthiopic";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadSerifEthiopic } from "@remotion/google-fonts/NotoSerifEthiopic";

const { fontFamily: montserrat } = loadMontserrat("normal", {
  weights: ["800", "900"],
  subsets: ["latin"],
});
const { fontFamily: inter } = loadInter("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
});
// Amharic (Ge'ez script) glyphs fall through to the Ethiopic fonts.
const { fontFamily: ethiopic } = loadEthiopic("normal", {
  weights: ["500", "700", "900"],
  subsets: ["ethiopic"],
});
const { fontFamily: serif } = loadSerif("italic", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: serifEthiopic } = loadSerifEthiopic("normal", {
  weights: ["700"],
  subsets: ["ethiopic"],
});

export const HEADLINE_FONT = `${montserrat}, ${ethiopic}, "Geeza Pro", sans-serif`;
export const BODY_FONT = `${inter}, ${ethiopic}, "Geeza Pro", sans-serif`;
/** Italic serif accent for editorial captions and card headlines. */
export const ACCENT_FONT = `${serif}, ${serifEthiopic}, Georgia, serif`;
