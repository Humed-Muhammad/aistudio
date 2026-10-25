import { list, str, useSvgId } from "../../../elements/kit";
import { mix } from "../../../colors";
import { beat, In, useCount, useProgress } from "../../motion";
import type { Cue, SceneProps } from "../../types";
import { APP_FONT, appColors, Avatar, type App, modeOf, parts, ProductLayout, Surface } from "../../ui";

const KPI0 = 2;
const CHART = 4.5;

const Kpi: React.FC<{ row: string; i: number; app: App; u: number }> = ({ row, i, app, u }) => {
  const [label, value, delta] = parts(row, 3);
  const shown = useCount(value, KPI0 + i * 0.8, 34);
  const down = delta.trim().startsWith("-");
  // A falling number can be good news (days to pay): colour by the accent unless the label says otherwise.
  return (
    <In step={KPI0 + i * 0.8} role="card" style={{ flex: 1, minWidth: 0 }}>
      <Surface app={app} k={u / 10} radius={36} style={{ padding: `${2.6 * u}px ${2.8 * u}px` }}>
        <div style={{ fontSize: 2.4 * u, color: app.sub, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontSize: 5.4 * u, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", margin: `${0.6 * u}px 0` }}>{shown}</div>
        {delta ? (
          <span style={{ fontSize: 2.2 * u, fontWeight: 700, padding: `${0.4 * u}px ${1.2 * u}px`, borderRadius: 99, background: app.soft, color: app.bg === "#0d0f14" ? mix(app.accent, "#ffffff", 0.4) : mix(app.accent, "#000000", 0.35) }}>
            {down ? "↓" : "↑"} {delta.replace(/^[+-]/, "")}
          </span>
        ) : null}
      </Surface>
    </In>
  );
};

/** A product dashboard: KPI cards count up, then the chart line draws with a filled area and an end marker. */
export default function Dashboard({ v, theme, accent, shape, k }: SceneProps) {
  const app = appColors(modeOf(theme), accent);
  const wide = shape === "wide";
  const W = (shape === "tall" ? 920 : wide ? 960 : 640) * k;
  const H = W * (shape === "tall" ? 0.95 : 0.66);
  const u = W / 100;
  const kpis = list(v, "kpis").slice(0, 3);
  const values = str(v, "series").split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));
  const series = values.length > 1 ? values : [1, 2];
  const draw = useProgress(beat(CHART), 40);
  const grad = useSvgId("dash");
  const max = Math.max(...series) * 1.1;
  const min = Math.min(0, ...series);
  const cw = 100;
  const ch = 40;
  const pts = series.map((n, i) => [(i / (series.length - 1)) * cw, ch - ((n - min) / (max - min)) * ch] as const);
  const path = pts.map(([x, y], i) => {
    if (!i) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
  }).join(" ");
  const reach = draw * cw;
  return (
    <ProductLayout shape={shape} k={k} theme={theme} accent={accent} caption={str(v, "caption")} captionWidth={wide ? 520 : undefined}>
      <In step={1} role="ui">
        <div style={{ width: W, height: H, borderRadius: 3 * u, background: app.bg, boxShadow: `${app.shadow}, 0 0 0 ${0.15 * u}px ${app.line}`, padding: 3.4 * u, display: "flex", flexDirection: "column", gap: 2.4 * u, fontFamily: APP_FONT, color: app.text, transform: `rotateX(${wide ? 3 : 6}deg)`, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 1.6 * u }}>
            <div style={{ width: 4.2 * u, height: 4.2 * u, borderRadius: 1.2 * u, background: `linear-gradient(145deg, ${mix(accent, "#ffffff", 0.25)}, ${accent})` }} />
            <b style={{ fontSize: 3 * u }}>{str(v, "product")}</b>
            <span style={{ flex: 1 }} />
            {["Overview", "Invoices", "Clients"].map((t, i) => (
              <span key={t} style={{ fontSize: 2.2 * u, fontWeight: 600, color: i ? app.sub : app.text, padding: `${0.6 * u}px ${1.4 * u}px`, borderRadius: 99, background: i ? "transparent" : app.surface2 }}>{t}</span>
            ))}
            <Avatar name="Selam T" size={4.4 * u} accent={accent} />
          </div>
          <div style={{ display: "flex", gap: 1.8 * u }}>
            {kpis.map((row, i) => (
              <Kpi key={i} row={row} i={i} app={app} u={u} />
            ))}
          </div>
          <In step={CHART - 0.5} role="card" style={{ flex: 1, display: "flex" }}>
            <Surface app={app} k={u / 10} radius={36} style={{ flex: 1, padding: `${2.6 * u}px ${2.8 * u}px`, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 2.6 * u, fontWeight: 700 }}>
                {str(v, "chart_title")}
                <span style={{ color: app.sub, fontWeight: 600, fontSize: 2.2 * u }}>12 months</span>
              </div>
              <svg viewBox={`-2 -4 ${cw + 4} ${ch + 8}`} preserveAspectRatio="none" style={{ flex: 1, width: "100%", marginTop: 1.6 * u, overflow: "visible" }}>
                <defs>
                  <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={accent} stopOpacity={0.45} />
                    <stop offset="1" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                  <clipPath id={grad + "c"}>
                    <rect x={-2} y={-4} width={reach + 2} height={ch + 8} />
                  </clipPath>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((g) => (
                  <line key={g} x1={0} x2={cw} y1={ch * g} y2={ch * g} stroke={app.line} strokeWidth={0.25} />
                ))}
                <g clipPath={`url(#${grad}c)`}>
                  <path d={`${path} L ${cw} ${ch} L 0 ${ch} Z`} fill={`url(#${grad})`} />
                  <path d={path} fill="none" stroke={accent} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 0.55 * u }} />
                </g>
              </svg>
            </Surface>
          </In>
        </div>
      </In>
    </ProductLayout>
  );
}

export const cues = (): Cue[] => [
  { frame: beat(KPI0) + 3, sound: "click" },
  { frame: beat(KPI0 + 0.8) + 3, sound: "click" },
  { frame: beat(KPI0 + 1.6) + 3, sound: "click" },
  { frame: beat(CHART) + 2, sound: "whoosh" },
];
