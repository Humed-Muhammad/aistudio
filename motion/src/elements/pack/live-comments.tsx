import { interpolate } from "remotion";
import { clamp, list, useLife } from "../kit";
import type { ElementProps } from "../types";

const COLORS = ["#ff8fa3", "#7cc8ff", "#7CF2C4", "#c9a7ff", "#ffb27a"];

export default function LiveComments({ v, theme, durationInFrames, k }: ElementProps) {
  const { frame, exit } = useLife(durationInFrames);
  const lines = list(v, "comments");
  const gap = Math.max(10, Math.floor((durationInFrames * 0.75) / Math.max(1, lines.length)));
  return (
    <div style={{ position: "relative", width: 640 * k, height: 560 * k, opacity: exit, overflow: "hidden", maskImage: "linear-gradient(transparent, #000 25%)", WebkitMaskImage: "linear-gradient(transparent, #000 25%)" }}>
      {lines.map((line, i) => {
        const f = frame - i * gap;
        if (f < 0) return null;
        const y = interpolate(f, [0, 10], [40, 0], clamp) * k;
        const shown = Math.min(lines.length, Math.floor(frame / gap) + 1);
        const at = shown - 1 - i; // newest at the bottom, older ones pushed up
        const [name, ...rest] = line.split(":");
        const text = rest.join(":").trim() || name;
        return (
          <div key={i} style={{ position: "absolute", left: 0, bottom: at * 120 * k + y, display: "flex", gap: 14 * k, alignItems: "center", opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
            <div style={{ width: 64 * k, height: 64 * k, borderRadius: 999, background: COLORS[i % COLORS.length], display: "grid", placeItems: "center", color: "#16181f", fontWeight: 900, fontSize: 30 * k, flexShrink: 0 }}>{name.trim().slice(0, 1).toUpperCase()}</div>
            <div style={{ padding: `${10 * k}px ${20 * k}px`, borderRadius: 24 * k, background: "rgba(0,0,0,.42)", backdropFilter: "blur(10px)", color: "#fff", fontFamily: theme.body }}>
              <div style={{ fontSize: 26 * k, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>{rest.length ? name.trim() : ""}</div>
              <div style={{ fontSize: 34 * k, fontWeight: 600 }}>{text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
