import { fit, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function TypingIndicator({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0, 11);
  const typing = frame < durationInFrames * 0.45;
  const msg = pop(frame, fps, Math.round(durationInFrames * 0.45), 11);
  const name = str(v, "name");
  const message = str(v, "message");
  return (
    <div style={{ display: "grid", gap: 8 * k, opacity: exit }}>
      {name ? <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 30 * k, color: "rgba(255,255,255,.8)", paddingLeft: 20 * k, textShadow: `0 ${2 * k}px ${10 * k}px rgba(0,0,0,.5)` }}>{name}</div> : null}
      <div style={{ justifySelf: "start", padding: typing ? `${28 * k}px ${34 * k}px` : `${22 * k}px ${32 * k}px`, maxWidth: 720 * k, borderRadius: 40 * k, borderBottomLeftRadius: 10 * k, background: "rgba(255,255,255,.94)", boxShadow: `0 ${10 * k}px ${28 * k}px rgba(0,0,0,.25)`, transform: `scale(${typing ? s : msg})`, transformOrigin: "0 100%" }}>
        {typing ? (
          <div style={{ display: "flex", gap: 12 * k }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 22 * k, height: 22 * k, borderRadius: 999, background: "#8a8f9c", transform: `translateY(${Math.sin(frame / 4 - i * 0.9) * -8 * k}px)` }} />
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: fit(message, 44 * k, 30), color: "#16181f", lineHeight: 1.3 }}>{message}</div>
        )}
      </div>
    </div>
  );
}
