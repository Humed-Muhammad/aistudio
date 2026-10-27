// Right-to-left words (Arabic quotes, duas and greetings inside Amharic talks) in captions. Captions lay words
// out as separate boxes, which the browser does not reorder, so the order is set here, and letters that join
// (Arabic) are never split into their own boxes, which would draw each one in its isolated form.

const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const JOINED = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;

type Dir = "ltr" | "rtl";

/** Direction of the first strong letter, or null for numbers and punctuation. */
const strong = (text: string): Dir | null => {
  for (const c of text) {
    if (RTL.test(c)) return "rtl";
    if (/\p{L}/u.test(c)) return "ltr";
  }
  return null;
};

export const textDir = (text: string): Dir => strong(text) ?? "ltr";

/**
 * The units a per-letter animation may move one by one: every letter, except in joined scripts, where the
 * whole word moves as one so its letters stay connected.
 */
export const letters = (text: string): string[] =>
  JOINED.test(text) ? [text] : Array.from(text);

/**
 * Words in the order to draw them in a flex row with `direction: dir`: the base direction comes from the
 * first strong word, and each run of words in the other direction is reversed so it reads the right way.
 * Numbers and punctuation between two words of one direction join their run.
 */
export const bidi = <T extends { text: string }>(tokens: T[]): { dir: Dir; tokens: T[] } => {
  const dirs = tokens.map((t) => strong(t.text));
  const dir = dirs.find((d) => d) ?? "ltr";
  const resolved = dirs.map((d, i) => {
    if (d) return d;
    const before = dirs.slice(0, i).reverse().find((x) => x);
    const after = dirs.slice(i + 1).find((x) => x);
    return before && before === after ? before : dir;
  });
  const out: T[] = [];
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (j < tokens.length && resolved[j] === resolved[i]) j++;
    const run = tokens.slice(i, j);
    out.push(...(resolved[i] === dir ? run : run.reverse()));
    i = j;
  }
  return { dir, tokens: out };
};

/** The word being spoken: the latest one already started (by time, so it works on reordered words). */
export const spokenIndex = (tokens: { fromMs: number }[], now: number) =>
  tokens.reduce((at, t, i) => (t.fromMs <= now && (at < 0 || t.fromMs >= tokens[at].fromMs) ? i : at), -1);
