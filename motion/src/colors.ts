/** Text colour that reads on a filled accent surface: near-black on light accents, white on dark ones. */
export const onAccent = (hex: string) => {
  const m = hex
    .replace("#", "")
    .match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111216" : "#ffffff";
};

/** Blend two hex colours: t=0 gives a, t=1 gives b. */
export const mix = (a: string, b: string, t: number) => {
  const rgb = (h: string) => {
    const m = h
      .replace("#", "")
      .match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
    return m ? m.slice(1).map((c) => parseInt(c, 16)) : [255, 255, 255];
  };
  const [x, y] = [rgb(a), rgb(b)];
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};

/**
 * Glass text fill: bright top, a hard reflection line just below the middle, a glowing lower half.
 * White gets a cool chrome tint so it still reads as glass.
 */
export const glass = (hex: string) => {
  const c = hex.toLowerCase() === "#ffffff" ? "#dbe5f1" : hex;
  return `linear-gradient(180deg, ${mix(c, "#ffffff", 0.85)} 0%, ${mix(c, "#ffffff", 0.45)} 30%, ${mix(c, "#ffffff", 0.15)} 48%, ${mix(c, "#000000", 0.28)} 50%, ${c} 66%, ${mix(c, "#ffffff", 0.5)} 100%)`;
};

/** Chrome text fill: polished metal with a dark horizon, tinted by the colour (white = silver). */
export const chrome = (hex: string) => {
  const c = hex.toLowerCase() === "#ffffff" ? "#9aa6b2" : hex;
  return `linear-gradient(180deg, #ffffff 0%, ${mix(c, "#ffffff", 0.55)} 22%, ${mix(c, "#ffffff", 0.2)} 46%, ${mix(c, "#000000", 0.55)} 49%, ${mix(c, "#000000", 0.2)} 58%, ${mix(c, "#ffffff", 0.35)} 82%, #ffffff 100%)`;
};
