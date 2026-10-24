import { Starred, ease, fit, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function QuoteCard({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 16);
  const text = ease(frame, fps, 8, 16);
  const author = ease(frame, fps, 18, 14);
  const quote = str(v, "quote");
  return (
    <div style={{ ...panel(theme, k, 36), position: "relative", width: 880 * k, padding: `${70 * k}px ${60 * k}px ${44 * k}px`, opacity: exit * box, transform: `scale(${0.94 + 0.06 * box})` }}>
      <div style={{ position: "absolute", left: 40 * k, top: -30 * k, fontFamily: "Georgia, serif", fontSize: 200 * k, lineHeight: 1, color: accent, opacity: 0.9 }}>“</div>
      <div style={{ opacity: text, transform: `translateY(${(1 - text) * 16 * k}px)` }}>
        <Starred text={quote} theme={theme} accent={accent} size={fit(quote, 56 * theme.type * k, 60)} color={theme.text} align="left" style={{ lineHeight: 1.3 }} />
      </div>
      <div style={{ marginTop: 24 * k, fontFamily: theme.body, fontWeight: 700, fontSize: 36 * k, color: theme.sub, opacity: author }}>{str(v, "author")}</div>
    </div>
  );
}
