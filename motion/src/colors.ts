/** Text colour that reads on a filled accent surface: near-black on light accents, white on dark ones. */
export const onAccent = (hex: string) => {
  const m = hex
    .replace("#", "")
    .match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111216" : "#ffffff";
};
