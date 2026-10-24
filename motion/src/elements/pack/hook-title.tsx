import { useCurrentFrame, useVideoConfig } from "remotion";
import { Starred, pop, str, useLife } from "../kit";
import type { ElementProps } from "../types";

const Line: React.FC<{ text: string; delay: number; size: number } & Pick<ElementProps, "theme" | "accent">> = ({ text, delay, size, theme, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/(\*[^*]+\*|\s+)/).filter((w) => w && !/^\s+$/.test(w));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.28}px` }}>
      {words.map((w, i) => {
        const p = pop(frame, fps, delay + i * 4, 13);
        return (
          <div key={i} style={{ opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * size * 0.5}px) scale(${0.85 + 0.15 * p})`, filter: `drop-shadow(0 ${size * 0.06}px ${size * 0.22}px rgba(0,0,0,.45))` }}>
            <Starred text={w} theme={theme} accent={accent} size={size} />
          </div>
        );
      })}
    </div>
  );
};

export default function HookTitle({ v, theme, accent, durationInFrames, k }: ElementProps) {
  const { exit } = useLife(durationInFrames);
  const size = 112 * theme.type * k;
  return (
    <div style={{ width: 960 * k, display: "grid", gap: size * 0.08, opacity: exit, transform: `translateY(${(1 - exit) * -30 * k}px)` }}>
      <Line text={str(v, "line1")} delay={0} size={size} theme={theme} accent={accent} />
      <Line text={str(v, "line2")} delay={8} size={size} theme={theme} accent={accent} />
    </div>
  );
}
