import { ease, fit, panel, str, useLife } from "../kit";
import type { ElementProps } from "../types";

export default function CommentReply({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const box = ease(frame, fps, 0, 16);
  const user = str(v, "user");
  const comment = str(v, "comment");
  return (
    <div style={{ ...panel(theme, k, 30), width: 860 * k, padding: `${26 * k}px ${30 * k}px`, display: "flex", gap: 22 * k, opacity: exit * box, transform: `translateY(${(1 - box) * -40 * k}px) scale(${0.95 + 0.05 * box})` }}>
      <div style={{ width: 86 * k, height: 86 * k, flexShrink: 0, borderRadius: 999, background: `linear-gradient(140deg, ${accent}, #8f7cff)`, display: "grid", placeItems: "center", color: "#fff", fontFamily: theme.head, fontWeight: 900, fontSize: 42 * k }}>{user.replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: 32 * k, color: theme.sub }}>Reply to {user.startsWith("@") ? user : "@" + user}’s comment</div>
        <div style={{ fontFamily: theme.body, fontWeight: 700, fontSize: fit(comment, 44 * k, 60), lineHeight: 1.3, color: theme.text, marginTop: 6 * k }}>{comment}</div>
      </div>
      <div style={{ display: "grid", justifyItems: "center", alignContent: "start", gap: 4 * k, color: theme.sub, fontFamily: theme.body, fontWeight: 700, fontSize: 28 * k }}>
        <span style={{ fontSize: 40 * k }}>♡</span>
        {str(v, "likes")}
      </div>
    </div>
  );
}
