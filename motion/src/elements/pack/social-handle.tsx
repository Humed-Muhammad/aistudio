import { interpolate } from "remotion";
import { clamp, fit, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

const BADGE: Record<string, [string, string]> = {
  TikTok: ["#111111", "♪"],
  Instagram: ["linear-gradient(45deg,#f9a03f,#e1306c 45%,#833ab4)", "◎"],
  YouTube: ["#ff2d2d", "▶"],
  Telegram: ["#2aa3e0", "➤"],
  X: ["#111111", "𝕏"],
  Facebook: ["#1877f2", "f"],
};

export default function SocialHandle({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, fps, exit } = useLife(durationInFrames);
  const s = pop(frame, fps, 0);
  const [bg, glyph] = BADGE[str(v, "platform")] ?? BADGE.TikTok;
  const shine = interpolate(frame, [14, 40], [-30, 130], clamp);
  return (
    <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 18 * k, padding: `${14 * k}px ${34 * k}px ${14 * k}px ${14 * k}px`, borderRadius: 999, background: theme.card, border: `${2 * k}px solid ${theme.border}`, boxShadow: theme.shadow, backdropFilter: theme.blur, opacity: exit, transform: `scale(${s * (0.92 + 0.08 * exit)})` }}>
      <div style={{ width: 72 * k, height: 72 * k, borderRadius: 999, background: bg, color: "#fff", display: "grid", placeItems: "center", fontSize: 40 * k, fontWeight: 800 }}>{glyph}</div>
      <div style={{ fontFamily: theme.head, fontWeight: theme.headWeight, fontSize: fit(str(v, "handle"), 50 * theme.type * k, 20), color: theme.text, whiteSpace: "nowrap", letterSpacing: theme.tracking }}>{str(v, "handle")}</div>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${shine - 20}%, rgba(255,255,255,.45) ${shine}%, transparent ${shine + 20}%)` }} />
    </div>
  );
}
