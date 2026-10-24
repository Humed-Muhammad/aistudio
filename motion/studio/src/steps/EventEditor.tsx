import { useEffect, useState } from "react";
import type { ShortEvent } from "../../../src/types";
import { TITLES } from "./Look";
import { ELEMENTS } from "../../../src/elements/registry.gen";
import type { Field, FieldValue } from "../../../src/elements/types";

/** Mirrors Event defaults in shorts.py, so a new graphic draws in the preview before it is saved. */
export const BLANK: ShortEvent = {
  type: "text",
  look: "",
  start: 0,
  end: 1,
  text: "",
  style: "pop",
  color: "#FFFFFF",
  accent: "",
  ink: "",
  background: "none",
  size: 1,
  x: 0.5,
  y: 0.3,
  behind_subject: false,
  asset: "",
  emoji: "",
  anchor: "screen",
  hand: "any",
  point: "above_palm",
  trigger: "time",
  animation: "pop",
  idle: "float",
  scale: 1.2,
  focus: "face",
  intensity: 1,
  sound: "whoosh",
  volume: 0.5,
  src_start: 0,
  speed: 1,
  layout: "split",
  corner: "top_right",
  template: "list",
  items: [],
  value: "",
  label: "",
  active: 1,
  side: "top",
  timeline: [],
  scene: "overlay",
};

const TEMPLATES: [ShortEvent["template"], string, string][] = [
  ["list", "List", "Rows appear as you say them"],
  ["steps", "Steps", "Numbered steps, one highlighted"],
  ["chips", "Chips", "Short tags side by side"],
  ["icons", "Icons", "Emoji with labels"],
  ["stat", "Big number", "One number with a caption"],
  ["slider", "Slider", "A scale from one end to the other"],
  ["quote", "Quote", "A quote and who said it"],
  ["title", "Title", "Big headline and a subtitle"],
];
const SCENES: [ShortEvent["scene"], string][] = [
  ["overlay", "Over you"],
  ["dim", "Dimmed"],
  ["dark", "Dark full screen"],
  ["light", "Light full screen"],
  ["split", "Split, you below"],
];
const EFFECT_CHOICES: [NonNullable<ShortEvent["effect"]>, string][] = [
  ["", "Same as video"],
  ["bloom", "Soft bloom"],
  ["leak", "Light leak"],
  ["blur", "Blur punch"],
  ["whip", "Whip"],
  ["dip", "Dip to black"],
  ["flash", "White flash"],
  ["none", "None"],
];
const SOUNDS = ["whoosh-soft", "whoosh-deep", "pop", "ui-click", "camera-click", "impact", "riser-bass", "hit", "success", "ding", "vine-boom", "record-scratch", "anime-wow", "yippee"];

/** Starting content for a design, keeping what fits, so the card is complete (and saves) right away. */
const switchTemplate = (e: ShortEvent, template: ShortEvent["template"]): Partial<ShortEvent> => {
  const items = e.items.map((i) => i.trim()).filter(Boolean);
  const plain = e.text.replace(/\*/g, "").trim();
  const patch: Partial<ShortEvent> = { template, timeline: [] };
  if (["list", "steps", "chips", "icons"].includes(template) && items.length < 2)
    patch.items = items.length ? [...items, "Second", "Third"] : ["First", "Second", "Third"];
  if (template === "stat" && !e.value.trim()) Object.assign(patch, { value: "100%", label: e.label || plain || items[0] || "" });
  if (template === "slider" && !/^\d+$/.test(e.value.trim())) Object.assign(patch, { value: "70", label: e.label.includes("|") ? e.label : "Before|After" });
  if ((template === "quote" || template === "title") && !e.text.trim()) patch.text = items[0] || "Your *words* here";
  return patch;
};

/**
 * Why saving would drop this graphic (mirrors check_plan in shorts.py), or "" when it is fine.
 * The editor keeps such a draft on screen and only saves once it is complete.
 */
export const problem = (e: ShortEvent, others: ShortEvent[]): string => {
  const items = e.items.filter((i) => i.trim());
  const overlaps = (x: ShortEvent) => x.start < e.end && e.start < x.end;
  if (e.type === "text" && !e.text.trim()) return "Add some text.";
  if (e.type === "element" && !ELEMENTS[e.element ?? ""]) return "This graphic is not in your library any more. Remove it, or add one from the library.";
  if (e.type === "look" && others.some((x) => x.type === "look" && overlaps(x))) return "This overlaps another look switch. Move it so they do not overlap.";
  if (e.type === "card") {
    if (["steps", "chips", "icons"].includes(e.template) && items.length < 2) return "Add at least 2 items.";
    if (e.template === "list" && items.length < 1) return "Add at least 1 item.";
    if (e.template === "stat" && !e.value.trim()) return "Add the number, such as 400%.";
    if ((e.template === "quote" || e.template === "title") && !e.text.trim()) return "Add the headline text.";
    const full = (x: ShortEvent) => (x.type === "card" && ["dark", "light", "split"].includes(x.scene)) || x.type === "broll";
    if (["dark", "light", "split"].includes(e.scene) && others.some((x) => full(x) && overlaps(x)))
      return "This full-screen card overlaps another full-screen card or recording. Move it, or choose Over you or Dimmed.";
  }
  return "";
};

const clockExact = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const parseTime = (v: string) => {
  const [m, s] = v.includes(":") ? v.split(":") : ["0", v];
  return Number(m) * 60 + Number(s);
};

/** A time box that accepts 0:12.5 or 12.5 and only commits a valid time. */
const TimeField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => {
  const [text, setText] = useState(clockExact(value));
  useEffect(() => setText(clockExact(value)), [value]);
  const commit = () => {
    const v = parseTime(text.trim());
    if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100) / 100);
    else setText(clockExact(value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </label>
  );
};

const Range: React.FC<{ label: string; value: number; min: number; max: number; step: number; show?: (v: number) => string; onChange: (v: number) => void }> = ({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
}) => (
  <label className="slider">
    {label}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <output>{show ? show(value) : value}</output>
  </label>
);

/** Colour choice: Default (the style's / video's colour), the palette, or any colour. */
const ColorRow: React.FC<{ label: string; value: string; empty: string; palette: [string, string][]; onChange: (v: string) => void }> = ({
  label,
  value,
  empty,
  palette,
  onChange,
}) => {
  const isDefault = !value || value.toUpperCase() === empty.toUpperCase();
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span className="hint" style={{ width: 92 }}>{label}</span>
      <div className="swatches">
        <button type="button" className={"btn small" + (isDefault ? "" : " secondary")} onClick={() => onChange(empty)}>
          Default
        </button>
        {palette.map(([name, hex]) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            className={"swatch" + (!isDefault && value.toUpperCase() === hex.toUpperCase() ? " on" : "")}
            style={{ background: hex }}
            onClick={() => onChange(hex.toUpperCase())}
          />
        ))}
        <input type="color" aria-label={`Any ${label.toLowerCase()}`} value={isDefault ? "#6EC1FF" : value} onChange={(x) => onChange(x.target.value.toUpperCase())} />
      </div>
    </div>
  );
};

/** One editable field of a library graphic, in the control that fits its type. */
const FieldInput: React.FC<{ f: Field; value: FieldValue; palette: [string, string][]; onChange: (v: FieldValue) => void }> = ({ f, value, palette, onChange }) => {
  if (f.type === "color") return <ColorRow label={f.label} value={String(value ?? "")} empty={String(f.default ?? "")} palette={palette} onChange={onChange} />;
  if (f.type === "toggle")
    return (
      <label className="check">
        <input type="checkbox" checked={value === true} onChange={(x) => onChange(x.target.checked)} />
        {f.label}
      </label>
    );
  if (f.type === "number" && (f.max ?? 100) - (f.min ?? 0) <= 1000)
    return <Range label={f.label} value={Number(value)} min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} onChange={onChange} />;
  return (
    <label className="field">
      <span>{f.label}</span>
      {f.type === "select" ? (
        <select value={String(value)} onChange={(x) => onChange(x.target.value)}>
          {(f.options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : f.type === "number" ? (
        <input type="number" value={Number(value)} min={f.min} max={f.max} step={f.step ?? 1} onChange={(x) => onChange(Number(x.target.value))} />
      ) : f.type === "list" ? (
        <textarea dir="auto" rows={4} value={(Array.isArray(value) ? value : String(value).split("\n")).join("\n")} onChange={(x) => onChange(x.target.value.split("\n"))} />
      ) : f.type === "longtext" ? (
        <textarea dir="auto" rows={3} value={String(value)} onChange={(x) => onChange(x.target.value)} />
      ) : (
        <input dir="auto" value={String(value)} onChange={(x) => onChange(x.target.value)} />
      )}
      {f.hint ? <small className="hint">{f.hint}</small> : null}
    </label>
  );
};

/** Edit one planned graphic; every change shows in the preview right away. */
export const EventEditor: React.FC<{
  event: ShortEvent;
  issue: string;
  /** The video's switch effect, shown on "Same as video". */
  video: string;
  palette: [string, string][];
  looks: string[];
  images: string[];
  clips: string[];
  onChange: (e: ShortEvent) => void;
}> = ({ event: e, issue, video, palette, looks, images, clips, onChange }) => {
  const set = (patch: Partial<ShortEvent>) => onChange({ ...e, ...patch });
  const listy = ["list", "steps", "chips", "icons"].includes(e.template);

  return (
    <div className="evedit">
      {issue ? <div className="stale">{issue} Not saved yet; the preview shows your change.</div> : null}
      <div className="grid">
        <TimeField label="Starts" value={e.start} onChange={(start) => set({ start, end: Math.max(e.end, start + 0.2) })} />
        <TimeField label="Ends" value={e.end} onChange={(end) => set({ end: Math.max(end, e.start + 0.2) })} />
      </div>

      {e.type === "text" ? (
        <>
          <label className="field">
            <span>Text</span>
            <input dir="auto" value={e.text} onChange={(x) => set({ text: x.target.value })} />
          </label>
          <Range label="Height" value={e.y} min={0.1} max={0.85} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(y) => set({ y })} />
          <Range label="Size" value={e.size} min={0.6} max={1.6} step={0.05} show={(v) => `${v.toFixed(2)}×`} onChange={(size) => set({ size })} />
          <label className="check">
            <input type="checkbox" checked={e.behind_subject} onChange={(x) => set({ behind_subject: x.target.checked })} />
            Behind me (text sits between the wall and you)
          </label>
          <ColorRow label="Text colour" value={e.ink ?? ""} empty="" palette={palette} onChange={(ink) => set({ ink })} />
          <ColorRow label="*Starred* words" value={e.color} empty="#FFFFFF" palette={palette} onChange={(color) => set({ color })} />
        </>
      ) : null}

      {e.type === "card" ? (
        <>
          <div className="section" style={{ paddingTop: 4 }}>
            <h3>Design</h3>
            <div className="templates">
              {TEMPLATES.map(([id, name, note]) => (
                <button
                  key={id}
                  type="button"
                  className={"tpl" + (e.template === id ? " on" : "")}
                  title={note}
                  onClick={() => set(switchTemplate(e, id))}
                >
                  {name}
                  <small>{note}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="hint" style={{ width: 70 }}>Where</span>
            <div className="seg">
              {SCENES.map(([id, name]) => (
                <button key={id} type="button" className={e.scene === id ? "on" : ""} onClick={() => set({ scene: id })}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Headline · put *stars* around words to colour them</span>
            <input dir="auto" value={e.text} onChange={(x) => set({ text: x.target.value })} placeholder="e.g. Vote in the *comments*" />
          </label>
          <ColorRow label="Accent colour" value={e.accent ?? ""} empty="" palette={palette} onChange={(accent) => set({ accent })} />
          <ColorRow label="Text colour" value={e.ink ?? ""} empty="" palette={palette} onChange={(ink) => set({ ink })} />
          {listy ? (
            <label className="field">
              <span>{e.template === "icons" ? "Items · one per line, emoji first (🎥 Record)" : "Items · one per line"}</span>
              <textarea
                dir="auto"
                rows={Math.max(3, e.items.length + 1)}
                value={e.items.join("\n")}
                onChange={(x) => set({ items: x.target.value.split("\n"), timeline: [] })}
                onBlur={() => set({ items: e.items.map((s) => s.trim()).filter(Boolean) })}
              />
            </label>
          ) : null}
          {e.template === "steps" || e.template === "list" || e.template === "icons" ? (
            <Range label="Highlighted" value={e.active} min={1} max={Math.max(1, e.items.length)} step={1} onChange={(active) => set({ active, timeline: [] })} />
          ) : null}
          {e.template === "stat" || e.template === "slider" ? (
            <div className="grid">
              <label className="field">
                <span>{e.template === "stat" ? "Number (e.g. 400% or $70)" : "End position 0–100"}</span>
                <input value={e.value} onChange={(x) => set({ value: x.target.value })} />
              </label>
              <label className="field">
                <span>{e.template === "stat" ? "Caption" : "End labels (Beginner|Pro)"}</span>
                <input dir="auto" value={e.label} onChange={(x) => set({ label: x.target.value })} />
              </label>
            </div>
          ) : null}
          {e.template === "quote" || e.template === "title" ? (
            <label className="field">
              <span>{e.template === "quote" ? "Who said it" : "Subtitle"}</span>
              <input dir="auto" value={e.label} onChange={(x) => set({ label: x.target.value })} />
            </label>
          ) : null}
          {e.scene === "overlay" ? (
            <label className="check">
              <input type="checkbox" checked={e.behind_subject} onChange={(x) => set({ behind_subject: x.target.checked })} />
              Behind me (your head and shoulders cover the card where they overlap)
            </label>
          ) : null}
          {e.scene === "overlay" || e.scene === "dim" ? (
            <>
              <Range label="Height" value={e.y} min={0.08} max={0.85} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(y) => set({ y })} />
              <p className="hint" style={{ marginTop: -4 }}>Lower % = higher on screen. Above about 12% the app's top bar may cover part of it.</p>
            </>
          ) : null}
          {e.timeline.length > 1 ? <p className="hint">This card changes as you speak; editing the items or highlight makes it one still card.</p> : null}
        </>
      ) : null}

      {e.type === "element" && ELEMENTS[e.element ?? ""] ? (
        (() => {
          const meta = ELEMENTS[e.element ?? ""].meta;
          const value = (f: Field) => (e.props?.[f.key] as FieldValue | undefined) ?? f.default;
          return (
            <>
              <p className="hint" style={{ margin: "2px 0 6px" }}>
                <b>{meta.name}</b> · {meta.description}
              </p>
              {meta.fields.map((f) => (
                <FieldInput key={f.key} f={f} value={value(f)} palette={palette} onChange={(v) => set({ props: { ...e.props, [f.key]: v } })} />
              ))}
              {meta.layout === "anchored" ? (
                <>
                  <Range label="Across" value={e.x} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(x) => set({ x })} />
                  <Range label="Height" value={e.y} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(y) => set({ y })} />
                  <Range label="Size" value={e.size} min={0.4} max={2} step={0.05} show={(v) => `${v.toFixed(2)}×`} onChange={(size) => set({ size })} />
                </>
              ) : null}
              <ColorRow label="Accent colour" value={e.accent ?? ""} empty="" palette={palette} onChange={(accent) => set({ accent })} />
              <button type="button" className="btn secondary small" onClick={() => set({ props: {} })}>
                Reset to the graphic's defaults
              </button>
            </>
          );
        })()
      ) : null}

      {e.type === "zoom" ? (
        <>
          <Range label="Zoom" value={e.scale} min={1.05} max={1.6} step={0.05} show={(v) => `${v.toFixed(2)}×`} onChange={(scale) => set({ scale })} />
          <div className="row">
            <span className="hint" style={{ width: 70 }}>On</span>
            <div className="seg">
              {(["face", "center"] as const).map((f) => (
                <button key={f} type="button" className={e.focus === f ? "on" : ""} onClick={() => set({ focus: f })}>
                  {f === "face" ? "My face" : "Center"}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {e.type === "flash" ? (
        <div className="section" style={{ paddingTop: 4 }}>
          <h3>Effect for this switch</h3>
          <div className="templates">
            {EFFECT_CHOICES.map(([id, name]) => (
              <button key={id} type="button" className={"tpl" + ((e.effect ?? "") === id ? " on" : "")} onClick={() => set({ effect: id })}>
                {name}
                {id === "" ? <small>{EFFECT_CHOICES.find(([x]) => x === video)?.[1]}</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {e.type === "shake" ? <Range label="Strength" value={e.intensity} min={0.2} max={2} step={0.1} onChange={(intensity) => set({ intensity })} /> : null}

      {e.type === "look" ? (
        <label className="field">
          <span>Switch to</span>
          <select value={e.look} onChange={(x) => set({ look: x.target.value })}>
            {looks.map((id) => (
              <option key={id} value={id}>
                {id === "original" ? "My real room" : (TITLES[id] ?? id)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {e.type === "sfx" ? (
        <>
          <label className="field">
            <span>Sound</span>
            <select value={e.sound} onChange={(x) => set({ sound: x.target.value })}>
              {[...new Set([e.sound, ...SOUNDS])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Range label="Volume" value={e.volume} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}`} onChange={(volume) => set({ volume })} />
        </>
      ) : null}

      {e.type === "sticker" ? (
        <div className="grid">
          <label className="field">
            <span>Emoji</span>
            <input value={e.emoji} onChange={(x) => set({ emoji: x.target.value, asset: x.target.value ? "" : e.asset })} />
          </label>
          <label className="field">
            <span>Or image</span>
            <select value={e.asset} onChange={(x) => set({ asset: x.target.value, emoji: x.target.value ? "" : e.emoji })}>
              <option value="">None</option>
              {images.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {e.type === "broll" ? (
        <>
          <label className="field">
            <span>Recording</span>
            <select value={e.asset} onChange={(x) => set({ asset: x.target.value })}>
              {[...new Set([e.asset, ...clips])].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="row">
            <span className="hint" style={{ width: 70 }}>Layout</span>
            <div className="seg">
              {(
                [
                  ["full", "Full screen"],
                  ["split", "Split"],
                  ["bubble", "Face bubble"],
                  ["front", "You in front"],
                ] as const
              ).map(([id, name]) => (
                <button key={id} type="button" className={e.layout === id ? "on" : ""} onClick={() => set({ layout: id })}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid">
            <TimeField label="Start inside the recording" value={e.src_start} onChange={(src_start) => set({ src_start })} />
            <Range label="Speed" value={e.speed} min={0.5} max={3} step={0.25} show={(v) => `${v}×`} onChange={(speed) => set({ speed })} />
          </div>
        </>
      ) : null}
    </div>
  );
};
