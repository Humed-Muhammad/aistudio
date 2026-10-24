import { useEffect, useRef, useState } from "react";
import { DEFAULT_LOOK } from "../../../src/Background";
import { LIGHT_PATTERNS, wallLayers } from "../../../src/wallLights";
import { api, clock, type BackgroundLook } from "../api";
import type { ShortEvent } from "../../../src/types";
import type { JobApi } from "../JobView";

type Preset = BackgroundLook & { id: string; note: string; look: string };

export const TITLES: Record<string, string> = {
  original: "Original",
  clean_blur: "Clean blur",
  dark_glow: "Dark glow",
  warm_studio: "Warm studio",
  charcoal: "Charcoal",
  cream: "Cream",
  grid_paper: "Grid paper",
  color_pop: "Color pop",
  studio_blue: "Studio blue",
  studio_coral: "Studio coral",
  studio_teal: "Studio teal",
  studio_violet: "Studio violet",
  studio_rose: "Studio rose",
  studio_forest: "Studio green",
  studio_haze: "Blue haze",
  studio_slate: "Studio slate",
  studio_sunset: "Sunset",
};
const LAMPS: [NonNullable<BackgroundLook["lamp"]>, string, string][] = [
  ["tube", "LED tube", "A vertical light tube"],
  ["twin", "Twin tubes", "Two tubes side by side"],
  ["neon", "Neon bar", "A horizontal bar up high"],
  ["globe", "Hanging bulb", "A warm bulb on a cord"],
  ["ring", "Ring lamp", "A round LED ring"],
  ["arch", "Neon arch", "An arch of light"],
  ["hex", "Hex panels", "Hexagon light panels"],
];
const MODES: [BackgroundLook["mode"], string][] = [
  ["original", "Original"],
  ["blur", "Blur my room"],
  ["glow", "Dark glow"],
  ["color", "Solid color"],
  ["gradient", "Gradient"],
  ["studio", "Studio wall"],
  ["grid", "Grid paper"],
  ["image", "My image"],
];
const COLORS = ["#08090C", "#141518", "#2A2B31", "#0A0D1A", "#2A2219", "#EFE9DD", "#F3F1EC", "#FFFFFF", "#FF6B3D", "#3FCF8E", "#7C5CFF"];

type Look = BackgroundLook & { look?: string; auto?: boolean };
export const lookName = (bg: Look) =>
  bg.look && TITLES[bg.look] ? TITLES[bg.look] : (MODES.find(([m]) => m === bg.mode)?.[1] ?? bg.mode) + (bg.look === "" && bg.mode !== "original" ? " (custom)" : "");

/** Little swatch that hints at each preset without rendering video. */
const swatch = (p: BackgroundLook): React.CSSProperties => {
  const glow = `radial-gradient(45% 35% at 50% 38%, ${p.light_color}88, transparent 70%)`;
  const base =
    p.mode === "color"
      ? p.color
      : p.mode === "studio"
        ? `radial-gradient(60% 42% at 58% 34%, ${p.color2}, transparent), radial-gradient(130% 90% at 55% 40%, ${p.color} 35%, #0008 100%), ${p.color}`
        : p.mode === "gradient"
        ? `linear-gradient(180deg, ${p.color}, ${p.color2})`
        : p.mode === "glow"
          ? `${glow}, linear-gradient(180deg, ${p.color2}, ${p.color})`
          : p.mode === "grid"
            ? "linear-gradient(rgba(20,20,40,.1) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, rgba(20,20,40,.1) 1px, transparent 1px) 0 0/10px 10px, #F3F1EC"
            : p.mode === "blur"
              ? "linear-gradient(160deg, #5b6470, #2c3138 60%, #3e3a33)"
              : "linear-gradient(160deg, #6f7a86, #3a4049 55%, #5a5246)";
  const extra = p.glow > 0 && p.mode !== "glow" ? `${glow}, ` : "";
  return {
    background: extra + base,
    filter: p.mode === "blur" ? "saturate(.9)" : undefined,
    ["--person-glow" as string]: p.rim > 0 ? `0 0 10px ${p.light_color}` : p.outline > 0 ? `0 0 0 2px ${p.outline_color}` : undefined,
  };
};

export const Look: React.FC<JobApi> = ({ job, busy, savePlan, toast, preview }) => {
  const saved: Look = { ...DEFAULT_LOOK, ...job.plan?.background };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [look, setLook] = useState<Look>(saved);
  const [dirty, setDirty] = useState(false);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    api<Preset[]>("/shorts/looks").then(setPresets).catch(() => {});
    return () => preview.set(undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The shared preview shows the look as it is being changed, before it is saved.
  useEffect(() => preview.set({ background: look }), [look]); // eslint-disable-line react-hooks/exhaustive-deps
  // Take server updates (e.g. after Ask Claude) unless the creator is mid-change.
  useEffect(() => {
    if (!dirty) setLook({ ...DEFAULT_LOOK, ...job.plan?.background });
  }, [job.plan?.background]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: Partial<Look>, preset = false) => {
    const value = { ...look, ...next, auto: false, ...(preset ? {} : { look: "" }) };
    setLook(value);
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(value), 600);
  };
  const save = async (value: Look) => {
    if (!job.plan) return;
    await savePlan({ ...job.plan, background: value });
    setDirty(false);
  };
  const pick = (p: Preset) => {
    const { id, note, ...rest } = p;
    void note;
    // Switching wall colour keeps the light design you picked.
    change({ ...DEFAULT_LOOK, ...rest, pattern: look.pattern ?? "pool", look: id }, true);
  };
  const giveBack = async () => {
    if (!job.plan) return;
    const value = { ...look, auto: true };
    setLook(value);
    await savePlan({ ...job.plan, background: value });
    toast("Claude will choose the look the next time it plans graphics.");
  };

  const slider = (key: keyof BackgroundLook, label: string, max = 1, min = 0, step = 0.05) => (
    <label className="slider" key={key}>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={look[key] as number}
        disabled={busy}
        onChange={(e) => change({ [key]: Number(e.target.value) })}
      />
      <output>{key === "scale" ? (look.scale as number).toFixed(2) + "×" : Math.round((look[key] as number) * 100)}</output>
    </label>
  );
  const colors = (key: "color" | "color2" | "light_color" | "outline_color", label: string) => (
    <div className="row" key={key}>
      <span className="hint" style={{ width: 96 }}>{label}</span>
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            className={"swatch" + (look[key].toUpperCase() === c ? " on" : "")}
            style={{ background: c }}
            disabled={busy}
            onClick={() => change({ [key]: c })}
          />
        ))}
        <input type="color" value={look[key]} disabled={busy} onChange={(e) => change({ [key]: e.target.value.toUpperCase() })} aria-label={`${label}: any color`} />
      </div>
    </div>
  );

  const images = job.assets;
  const cutout = !!job.tracking && (job.manifest?.tracking ?? "full") === "full";

  return (
    <div className="inspector">
          <div className="compare">
            <span className="hint">{dirty ? "Saving…" : look.auto === false ? "Your choice · Claude keeps it" : "Chosen by Claude"}</span>
            {look.auto === false ? (
              <button type="button" className="btn secondary small" disabled={busy} onClick={giveBack}>
                Let Claude choose
              </button>
            ) : null}
          </div>
          <h2>Background & lighting</h2>
          <p className="lead">
            You are cut out of your video and placed on a new background, with light around you. Claude picks one
            automatically; pick here only if you want a different one.
          </p>
          {!cutout ? (
            <div className="stale">
              {job.tracking
                ? `Tracking was ${job.manifest?.tracking === "off" ? "off" : "fast"} for this edit, so there is no cutout: only Original works. Set Tracking to Full in Cut and rebuild for studio looks.`
                : "Build your edit first: the cutout is made while tracking."}
            </div>
          ) : null}
          {job.plan ? <InSwitch job={job} busy={busy} savePlan={savePlan} preview={preview} /> : null}

          <div className="section">
            <h3>Looks</h3>
            <div className="looks">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={"look" + (look.look === p.id ? " on" : "")}
                  disabled={busy}
                  title={p.note}
                  onClick={() => pick(p)}
                >
                  <span className="sw" style={swatch(p)} />
                  <span>
                    {TITLES[p.id] ?? p.id}
                    <small>{p.note.split(":")[0]}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {look.mode === "studio" ? (
            <div className="section">
              <h3>Light design</h3>
              <p className="hint" style={{ marginTop: -4 }}>
                How the lamp lights the wall behind you. It stays fixed where your head usually is.
              </p>
              <div className="looks lights">
                {LIGHT_PATTERNS.map(([id, name, note]) => (
                  <button key={id} type="button" className={"look" + ((look.pattern ?? "pool") === id ? " on" : "")} disabled={busy} title={note} onClick={() => change({ pattern: id })}>
                    <span className="sw" style={{ filter: look.dim !== 0.5 ? `brightness(${1.35 - look.dim * 0.7})` : undefined }}>
                      {wallLayers({ ...look, pattern: id }, [0.5, 0.42], 0, 0.1).map((style, i) => (
                        <span key={i} style={{ position: "absolute", inset: 0, ...style }} />
                      ))}
                    </span>
                    <span>
                      {name}
                      <small>{note}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {look.mode === "studio" || look.mode === "glow" || look.mode === "gradient" || look.mode === "color" ? (
            <div className="section">
              <h3>Lamp on the wall</h3>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="hint" style={{ width: 70 }}>Where</span>
                <div className="seg">
                  {(["none", "left", "right", "both"] as const).map((t) => (
                    <button key={t} type="button" className={look.tube === t ? "on" : ""} disabled={busy} onClick={() => change({ tube: t })}>
                      {t === "none" ? "No lamp" : t === "both" ? "Both sides" : t === "left" ? "Left" : "Right"}
                    </button>
                  ))}
                </div>
              </div>
              {look.tube && look.tube !== "none" ? (
                <div className="templates">
                  {LAMPS.map(([id, name, note]) => (
                    <button key={id} type="button" className={"tpl" + ((look.lamp ?? "tube") === id ? " on" : "")} disabled={busy} onClick={() => change({ lamp: id })}>
                      {name}
                      <small>{note}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <Switches job={job} busy={busy} presets={presets} savePlan={savePlan} toast={toast} />

          <details className="section" open={look.look === ""}>
            <summary>Fine-tune</summary>
            <div className="sliders" style={{ marginTop: 14 }}>
              <div className="row">
                <span className="hint" style={{ width: 96 }}>Background</span>
                <select value={look.mode} disabled={busy} style={{ width: "auto" }} onChange={(e) => change({ mode: e.target.value as BackgroundLook["mode"] })}>
                  {MODES.map(([m, label]) => (
                    <option key={m} value={m} disabled={m === "image" && !images.length}>
                      {label}
                      {m === "image" && !images.length ? " (upload an image under Graphics)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {look.mode === "image" ? (
                <div className="row">
                  <span className="hint" style={{ width: 96 }}>Image</span>
                  <select value={look.image} disabled={busy} style={{ width: "auto" }} onChange={(e) => change({ image: e.target.value })}>
                    <option value="">Choose…</option>
                    {images.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {["color", "gradient", "glow", "studio"].includes(look.mode) ? colors("color", look.mode === "color" ? "Color" : look.mode === "studio" ? "Wall" : "Bottom") : null}
              {["gradient", "glow", "studio"].includes(look.mode) ? colors("color2", look.mode === "studio" ? "Light" : "Top") : null}
              {["blur", "image"].includes(look.mode) ? [slider("blur", "Blur"), slider("dim", "Darken")] : null}
              {look.mode === "studio" ? (
                <label className="slider">
                  Brightness
                  <input type="range" min={0} max={1} step={0.05} value={1 - look.dim} disabled={busy} onChange={(e) => change({ dim: 1 - Number(e.target.value) })} />
                  <output>{Math.round((1 - look.dim) * 100)}</output>
                </label>
              ) : null}
              <h3 style={{ marginTop: 10 }}>Light</h3>
              {colors("light_color", "Light color")}
              {slider("glow", "Glow behind")}
              {slider("rim", "Rim light")}
              {slider("spotlight", "Spotlight")}
              {slider("vignette", "Vignette")}
              <h3 style={{ marginTop: 10 }}>Pro finish</h3>
              {slider("wrap", "Match light")}
              {slider("reframe", "Reframe")}
              {slider("grade", "Grade")}
              {slider("grain", "Film grain")}
              <div className="row">
                <span className="hint" style={{ width: 96 }}>LED tube</span>
                <div className="seg">
                  {(["none", "left", "right", "both"] as const).map((t) => (
                    <button key={t} type="button" className={look.tube === t ? "on" : ""} disabled={busy} onClick={() => change({ tube: t })}>
                      {t === "none" ? "Off" : t === "both" ? "Both" : t === "left" ? "Left" : "Right"}
                    </button>
                  ))}
                </div>
              </div>
              <h3 style={{ marginTop: 10 }}>You</h3>
              {slider("shadow", "Shadow")}
              {slider("outline", "Outline")}
              {look.outline > 0 ? colors("outline_color", "Outline color") : null}
              {slider("scale", "Size", 1.2, 1, 0.01)}
            </div>
          </details>
    </div>
  );
};

/**
 * A look switch overrides the look you pick for its part of the video. When the preview stands inside one,
 * say so: otherwise picking a wall there seems to do nothing.
 */
const InSwitch: React.FC<Pick<JobApi, "job" | "busy" | "savePlan" | "preview">> = ({ job, busy, savePlan, preview }) => {
  const fps = 30;
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setAt((preview.player.current?.getCurrentFrame() ?? 0) / fps), 250);
    return () => window.clearInterval(t);
  }, [preview.player]);
  const plan = job.plan!;
  const i = plan.events.findIndex((e) => e.type === "look" && at >= e.start && at < e.end);
  if (i < 0) return null;
  const e = plan.events[i];
  const after = Math.min(e.end + 0.3, (job.manifest?.duration ?? e.end + 1) - 0.1);
  return (
    <div className="stale" role="status">
      <b>
        {clock(e.start)}–{clock(e.end)} switches to {e.look === "original" ? "your real room" : (TITLES[e.look ?? ""] ?? e.look)}.
      </b>{" "}
      The look you pick shows everywhere else in the video, just not in this part.
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn secondary small" onClick={() => preview.player.current?.seekTo(Math.round(after * fps))}>
          Jump past it
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() => {
            const q = structuredClone(plan);
            q.events.splice(i, 1);
            savePlan(q);
          }}
        >
          Remove this switch
        </button>
      </div>
    </div>
  );
};

const seconds = (v: string) => {
  v = v.trim();
  if (!v) return NaN;
  const [m, sec] = v.includes(":") ? v.split(":") : ["0", v];
  return Number(m) * 60 + Number(sec);
};

/** Different looks for parts of the video, e.g. the real room from 0:12 to 0:20. */
const Switches: React.FC<Pick<JobApi, "job" | "busy" | "savePlan" | "toast"> & { presets: Preset[] }> = ({ job, busy, presets, savePlan, toast }) => {
  const plan = job.plan!;
  const [form, setForm] = useState({ start: "", end: "", look: "original" });
  const switches = plan.events.map((e, i) => [e, i] as const).filter(([e]) => e.type === "look");
  const add = () => {
    const start = seconds(form.start);
    const end = seconds(form.end);
    if (!(start >= 0 && end > start)) {
      toast("Enter a start and a later end, like 0:12 and 0:20.", true);
      return;
    }
    savePlan({ ...plan, events: [...plan.events, { type: "look", start, end, look: form.look } as ShortEvent] }).then(() =>
      setForm({ ...form, start: "", end: "" }),
    );
  };
  return (
    <div className="section">
      <h3>Switch look for a part</h3>
      <p className="hint" style={{ marginTop: -4 }}>
        Show your real room (or any other look) for a stretch of the video. It fades in and out; framing and colour grade stay the same.
      </p>
      <div className="events">
        {switches.map(([e, i]) => (
          <div key={i} className="ev">
            <time>
              {clock(e.start)}–{clock(e.end)}
            </time>
            <span>
              <span className="kind">Look</span>
              {TITLES[e.look ?? ""] ?? e.look}
            </span>
            <button
              type="button"
              title="Remove"
              disabled={busy}
              onClick={() => {
                const q = structuredClone(plan);
                q.events.splice(i, 1);
                savePlan(q);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint">From</span>
        <input style={{ width: 76 }} placeholder="0:12" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="Switch from (m:ss)" />
        <span className="hint">to</span>
        <input style={{ width: 76 }} placeholder="0:20" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="Switch until (m:ss)" />
        <select style={{ width: "auto" }} value={form.look} onChange={(e) => setForm({ ...form, look: e.target.value })} aria-label="Look for this part">
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === "original" ? "Original room" : (TITLES[p.id] ?? p.id)}
            </option>
          ))}
        </select>
        <button type="button" className="btn secondary small" disabled={busy} onClick={add}>
          Add switch
        </button>
      </div>
    </div>
  );
};
