import { useCurrentFrame } from "remotion";
import { list, panel, str } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, In, useMotion, Words } from "../../motion";
import { Icon } from "../../icons";
import type { Cue, SceneProps, Values } from "../../types";
import { accentWord, fitSize, Glow, headline, Logo, modeOf, Stage } from "../../ui";

const Satellite: React.FC<{ name: string; i: number; x: number; y: number; props: SceneProps }> = ({ name, i, x, y, props }) => {
  const { theme, accent, k } = props;
  const { travel } = useMotion(2 + i * 0.5, "icon");
  const dark = modeOf(theme) === "dark";
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", translate: `${x - 56 * k}px ${y - 56 * k}px`, scale: Math.max(0, travel) }}>
      <div style={{ ...panel(theme, k, 30), width: 112 * k, height: 112 * k, display: "grid", placeItems: "center" }}>
        <Icon name={name} size={54 * k} color={dark ? mix(accent, "#ffffff", 0.35) : mix(accent, "#000000", 0.2)} />
      </div>
    </div>
  );
};

/** The brand at the centre; icons orbit it on two rings, inner and outer turning opposite ways. */
export default function Orbit(props: SceneProps) {
  const { v, theme, accent, accent2, shape, k, brand } = props;
  const frame = useCurrentFrame();
  const icons = list(v, "icons").slice(0, 10);
  const title = str(v, "title");
  const size = fitSize(title, (shape === "wide" ? 100 : 92) * k, 22);
  const R = (shape === "tall" ? 380 : 330) * k;
  const inner = icons.slice(0, Math.ceil(icons.length / 2));
  const outer = icons.slice(inner.length);
  const ink = theme.ink ?? theme.text;
  return (
    <Stage shape={shape} k={k} row gap={shape === "wide" ? 80 : 40}>
      <h2 style={{ ...headline(theme, size), maxWidth: (shape === "wide" ? 640 : 900) * k, flex: "none" }}>
        <Words text={title} step={0} accentStyle={accentWord(theme, accent, size)} />
      </h2>
      <div style={{ position: "relative", width: R * 2.3, height: R * 2.3, flex: "none" }}>
        <Glow color={accent} size={R * 1.8} strength={0.35} style={{ left: "50%", top: "50%", translate: "-50% -50%" }} />
        {[0.58, 1].map((r) => (
          <div key={r} style={{ position: "absolute", left: "50%", top: "50%", width: R * 2 * r, height: R * 2 * r, translate: "-50% -50%", borderRadius: "50%", border: `${2 * k}px dashed ${mix(accent, ink, 0.5)}55` }} />
        ))}
        {[...inner.map((n, i) => ({ n, i, ring: 0.58, count: inner.length, dir: 1 })), ...outer.map((n, i) => ({ n, i, ring: 1, count: outer.length, dir: -1 }))].map(({ n, i, ring, count, dir }, j) => {
          const a = (i / count) * Math.PI * 2 + dir * frame * 0.006 + (ring === 1 ? 0.4 : 0);
          return <Satellite key={j} name={n} i={j} x={Math.cos(a) * R * ring} y={Math.sin(a) * R * ring} props={props} />;
        })}
        <div style={{ position: "absolute", left: "50%", top: "50%", translate: "-50% -50%" }}>
          <In step={1} role="icon">
            <Logo brand={brand} size={170 * k} accent={accent} accent2={accent2} />
          </In>
        </div>
      </div>
    </Stage>
  );
}

export const cues = (v: Values): Cue[] => [{ frame: beat(1) + 3, sound: "pop" }, ...list(v, "icons").slice(0, 10).filter((_, i) => i % 3 === 0).map((_, i) => ({ frame: beat(2 + i * 1.5) + 3, sound: "click" as const }))];
