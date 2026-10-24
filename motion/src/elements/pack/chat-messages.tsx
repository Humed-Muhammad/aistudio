import { fit, list, pop, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function ChatMessages({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const lines = list(v, "messages");
  const gap = Math.max(8, Math.floor((durationInFrames * 0.7) / Math.max(1, lines.length)));
  return (
    <div style={{ width: 860 * k, display: "grid", gap: 16 * k, opacity: exit }}>
      {lines.map((line, i) => {
        const mine = /^me:/i.test(line);
        const text = line.replace(/^me:\s*/i, "");
        const p = pop(frame, fps, i * gap, 12);
        if (p <= 0.01) return null;
        return (
          <div key={i} style={{ justifySelf: mine ? "end" : "start", maxWidth: 620 * k, padding: `${18 * k}px ${28 * k}px`, borderRadius: 36 * k, [mine ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: 10 * k, background: mine ? accent : "rgba(255,255,255,.92)", color: mine ? "#fff" : "#16181f", fontFamily: theme.body, fontWeight: 600, fontSize: fit(text, 42 * k, 34), lineHeight: 1.3, boxShadow: `0 ${8 * k}px ${24 * k}px rgba(0,0,0,.25)`, transform: `scale(${p})`, transformOrigin: mine ? "100% 100%" : "0 100%" }}>
            {text}
          </div>
        );
      })}
    </div>
  );
}
