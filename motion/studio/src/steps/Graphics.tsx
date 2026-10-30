import { useEffect, useMemo, useRef, useState } from "react";
import type { ShortEvent } from "../../../src/types";
import { api, clock, fileUrl, jobUrl } from "../api";
import type { JobApi } from "../JobView";
import { ELEMENTS } from "../../../src/elements/registry.gen";
import type { ElementMeta, FieldValue } from "../../../src/elements/types";
import { BLANK, EventEditor, problem } from "./EventEditor";
import { Library } from "./Library";

const describe = (e: ShortEvent): [string, string] => {
  if (e.type === "text") return ["Text", `“${e.text}”${e.behind_subject ? " behind you" : ""}`];
  if (e.type === "sticker") {
    const where =
      e.anchor === "hand"
        ? `on ${e.hand === "any" ? "a" : e.hand + "-side"} hand${e.trigger !== "time" ? " when " + e.trigger.replace("_", " ") : ""}`
        : e.anchor === "face"
          ? e.point === "beside_face"
            ? "beside your face"
            : "above your head"
          : "on screen";
    return ["Image", `${e.asset || e.emoji} ${where}`];
  }
  if (e.type === "zoom") return ["Zoom", `punch in ${e.scale}× on ${e.focus === "face" ? "your face" : "the center"}`];
  if (e.type === "broll") {
    const lay = { full: "full screen", split: "split with you below", bubble: `your face in a ${e.corner.replace("_", " ")} bubble`, front: "you in front" }[e.layout];
    return ["Screen", `${e.asset} · ${lay} · from ${e.src_start.toFixed(1)}s${e.speed !== 1 ? " at " + +e.speed.toFixed(2) + "×" : ""}`];
  }
  if (e.type === "card") {
    const scene = { overlay: "over you", dim: "background dimmed", dark: "dark full screen", light: "light full screen", split: "split with you below" }[e.scene];
    const what =
      e.template === "stat" ? e.value : e.template === "steps" ? `${e.active} of ${e.items.length}: ${e.items[e.active - 1] || ""}` : (e.text || e.items.join(", ")).replace(/\*/g, "");
    return [e.template, `${what} · ${scene}${e.behind_subject && e.scene === "overlay" ? " · behind you" : ""}`];
  }
  if (e.type === "no_captions") return ["No captions", "captions hidden for these words"];
  if (e.type === "look") return ["Look", `switch to ${e.look === "original" ? "your real room" : e.look}`];
  if (e.type === "element") {
    const meta = ELEMENTS[e.element ?? ""]?.meta;
    if (!meta) return ["Graphic", `${e.element} (not in your library)`];
    const first = meta.fields.find((f) => f.type === "text" || f.type === "longtext" || f.type === "list");
    const value = first ? (e.props?.[first.key] ?? first.default) : "";
    return [meta.name, String(Array.isArray(value) ? value.join(", ") : value).replace(/\*/g, "")];
  }
  if (e.type === "flash") return ["Effect", e.effect ? (EFFECTS.find(([id]) => id === e.effect)?.[1] ?? e.effect) : "same as the video"];
  if (e.type === "sfx") return ["Sound", e.sound];
  return [e.type, ""];
};

const seconds = (v: string) => {
  v = v.trim();
  if (!v) return NaN;
  const [m, s] = v.includes(":") ? v.split(":") : ["0", v];
  return Number(m) * 60 + Number(s);
};

const EFFECTS: [NonNullable<NonNullable<JobApi["job"]["plan"]>["transition"]>, string, string][] = [
  ["bloom", "Soft bloom", "A warm glow, like a lens catching light"],
  ["leak", "Light leak", "Orange-pink film light sweeping across"],
  ["blur", "Blur punch", "Quick zoom with a blur"],
  ["whip", "Whip", "Fast whip-pan slide"],
  ["dip", "Dip to black", "A short fade through black"],
  ["flash", "White flash", "The classic camera flash"],
  ["none", "None", "Looks just cross-fade"],
];

/** Moments where the look changes: each look switch's start, and its end unless another switch starts there. */
const lookChanges = (events: ShortEvent[]) => {
  const looks = events.filter((e) => e.type === "look");
  const at = looks.flatMap((e) => [e.start, ...(looks.some((x) => Math.abs(x.start - e.end) < 0.05) ? [] : [e.end])]);
  return [...new Set(at.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
};

const STYLES: [NonNullable<NonNullable<JobApi["job"]["plan"]>["graphics_style"]>, string, string, React.ReactNode][] = [
  ["glass", "Liquid glass", "Frosted panels · tech, AI", <><b>The</b> <i>problem</i></>],
  ["bold", "Bold block", "Marker highlight · loud tips", <><b>THE</b> <i>PROBLEM</i></>],
  ["editorial", "Editorial", "Serif accent · calm, premium", <><b>The</b> <i>problem</i></>],
  ["minimal", "Minimal", "No panels · big type", <><b>The</b> <i>problem</i></>],
  ["tech", "Tech", "Dark grid, glow · code, data", <><b>The</b> <i>problem</i></>],
  ["brutal", "Neo-brutal", "Thick outline, hard shadow · hot takes", <><b>The</b> <i>problem</i></>],
  ["aurora", "Aurora", "Violet-coral gradient · inspiring", <><b>The</b> <i>problem</i></>],
  ["candy", "Candy", "Pastel, extra round · playful", <><b>The</b> <i>problem</i></>],
  ["noir", "Noir", "Black, serif accent · luxury", <><b>The</b> <i>problem</i></>],
  ["swiss", "Swiss", "Square, all caps · facts, lists", <><b>THE</b> <i>PROBLEM</i></>],
  ["clay", "Clay", "Soft 3D grey · calm how-tos", <><b>The</b> <i>problem</i></>],
  ["cartoon", "Cartoon", "Flat sticker cards · playful explainers", <><b>The</b> <i>problem</i></>],
];

export const Graphics: React.FC<JobApi> = ({ job, busy, setup, show, post, savePlan, toast, preview }) => {
  const p = job.plan!;
  const [notes, setNotes] = useState("");
  const [json, setJson] = useState(JSON.stringify(p, null, 1));
  const [jsonDirty, setJsonDirty] = useState(false);
  const [nocap, setNocap] = useState({ start: "", end: "" });
  const [uploading, setUploading] = useState("");
  useEffect(() => {
    if (!jsonDirty) setJson(JSON.stringify(p, null, 1));
  }, [p, jsonDirty]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    const d = new FormData();
    files.forEach((f) => d.append("images", f));
    const videos = files.some((f) => f.type.startsWith("video/") || /\.(mov|m4v|mp4|webm)$/i.test(f.name));
    setUploading(videos ? "Uploading and preparing your recording… (a few seconds per minute)" : "Uploading…");
    try {
      show(await api(jobUrl(job.id, "assets"), { method: "POST", body: d }));
      toast(videos ? "Screen recording added. Use Auto-plan, or ask Claude Code to place it." : "Images added.");
    } catch (e) {
      toast((e as Error).message, true);
    }
    setUploading("");
  };
  const removeAsset = async (name: string) => {
    try {
      show(await api(jobUrl(job.id, `assets/${encodeURIComponent(name)}`), { method: "DELETE" }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const player = preview.player;
  const [looks, setLooks] = useState<string[]>([]);
  // The graphic being edited: changes play in the preview at once and save after a short pause.
  const [editing, setEditing] = useState<{ i: number; e: ShortEvent } | null>(null);
  const [saving, setSaving] = useState(false);
  // "Swap for another graphic": the next library click replaces the open graphic instead of adding one.
  const [swapping, setSwapping] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => {
    api<{ id: string }[]>("/shorts/looks").then((l) => setLooks(l.map((x) => x.id)), () => {});
  }, []);
  const shown = useMemo(() => {
    if (!editing) return undefined;
    const list = [...p.events];
    if (editing.i >= list.length) list.push(editing.e);
    else list[editing.i] = editing.e;
    return { events: list };
  }, [p.events, editing]);
  useEffect(() => () => preview.set(undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => preview.set(shown), [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = (t: number) => {
    const fps = 30;
    player.current?.seekTo(Math.max(0, Math.round(t * fps)));
  };
  const pending = useRef<{ i: number; e: ShortEvent } | null>(null);
  const flush = async () => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const q = structuredClone(p);
    if (next.i >= q.events.length) q.events.push(next.e);
    else q.events[next.i] = next.e;
    await savePlan(q);
    setSaving(false);
  };
  const others = (i: number) => p.events.filter((_, k) => k !== i);
  const edit = (i: number, e: ShortEvent) => {
    setEditing({ i, e });
    window.clearTimeout(timer.current);
    // Saving an incomplete graphic would drop it from the plan: keep it as a draft until it is complete.
    if (problem(e, others(i))) {
      pending.current = null;
      setSaving(false);
      return;
    }
    setSaving(true);
    pending.current = { i, e };
    timer.current = window.setTimeout(flush, 700);
  };
  // Saving sorts graphics by time (and merges identical back-to-back cards): find the edited one again.
  useEffect(() => {
    if (!editing || pending.current) return;
    let best = -1;
    p.events.forEach((x, k) => {
      if (x.type === editing.e.type && (best < 0 || Math.abs(x.start - editing.e.start) < Math.abs(p.events[best].start - editing.e.start))) best = k;
    });
    // Keep the local draft (e.g. an empty row just typed) while it is open; only follow its new position.
    if (best < 0) setEditing(null);
    else if (best !== editing.i) setEditing({ i: best, e: editing.e });
  }, [p.events]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (i: number) => {
    setSwapping(false);
    if (editing?.i === i) {
      await flush();
      setEditing(null);
      return;
    }
    await flush();
    setEditing({ i, e: p.events[i] });
    seek(p.events[i].start + 0.3);
  };
  const add = (kind: "text" | "card") => {
    const at = Math.round(((player.current?.getCurrentFrame() ?? 0) / 30) * 10) / 10;
    const e: ShortEvent =
      kind === "text"
        ? { ...BLANK, type: "text", start: at, end: at + 2, text: "New text" }
        : { ...BLANK, type: "card", start: at, end: at + 3, template: "list", text: "My *list*", items: ["First", "Second", "Third"], scene: "overlay", y: 0.3 };
    edit(p.events.length, e);
    seek(at + 0.4);
  };
  const addElement = (meta: ElementMeta) => {
    const at = Math.round(((player.current?.getCurrentFrame() ?? 0) / 30) * 10) / 10;
    const e: ShortEvent = { ...BLANK, type: "element", element: meta.id, props: {}, start: at, end: at + meta.duration, x: meta.x, y: meta.y, size: 1 };
    edit(p.events.length, e);
    seek(at + meta.duration * (meta.poster ?? 0.55));
  };
  const remove = (i: number) => {
    setSwapping(false);
    window.clearTimeout(timer.current);
    pending.current = null;
    setEditing(null);
    setSaving(false);
    const q = structuredClone(p);
    q.events.splice(i, 1);
    savePlan(q);
  };
  // Replace the open graphic with a library one in place: same timing, position, size and accent,
  // and its words carried into the new fields (same key first, then text into text, list into list).
  const swapElement = (meta: ElementMeta) => {
    if (!editing) return;
    const old = editing.e;
    const before = ELEMENTS[old.element ?? ""]?.meta;
    const texts: string[] = [];
    let lines: string[] | undefined;
    if (old.type === "element" && before) {
      for (const f of before.fields) {
        const v = old.props?.[f.key];
        if (v === undefined) continue;
        if ((f.type === "text" || f.type === "longtext") && typeof v === "string") texts.push(v);
        if (f.type === "list" && Array.isArray(v)) lines ??= v;
      }
    } else {
      if (old.text) texts.push(old.text);
      if (old.items?.length) lines = old.items;
    }
    const props: Record<string, FieldValue> = {};
    const kept = new Set<string>();
    for (const f of meta.fields) {
      const v = old.type === "element" ? old.props?.[f.key] : undefined;
      if (v !== undefined && before?.fields.some((g) => g.key === f.key && g.type === f.type)) {
        props[f.key] = v as FieldValue;
        if (typeof v === "string") kept.add(v);
      }
    }
    const spare = texts.filter((t) => !kept.has(t));
    for (const f of meta.fields) {
      if (f.key in props) continue;
      if ((f.type === "text" || f.type === "longtext") && spare.length) props[f.key] = spare.shift()!;
      else if (f.type === "list" && lines) props[f.key] = lines;
    }
    const anchored = meta.layout === "anchored" && (old.type !== "element" || before?.layout === "anchored");
    const e: ShortEvent = {
      ...BLANK,
      type: "element",
      element: meta.id,
      props,
      start: old.start,
      end: old.end > old.start + 0.3 ? old.end : old.start + meta.duration,
      x: anchored && old.type === "element" ? old.x : meta.x,
      y: anchored && old.type === "element" ? old.y : meta.y,
      size: old.type === "element" ? old.size : 1,
      accent: old.accent ?? "",
      behind_subject: old.behind_subject,
    };
    setSwapping(false);
    edit(editing.i, e);
    seek(e.start + (e.end - e.start) * (meta.poster ?? 0.55));
    toast(`Swapped for ${meta.name}.`);
  };
  // A library graphic used in this video: remove the one nearest the paused preview.
  const removeElement = (id: string) => {
    const at = (player.current?.getCurrentFrame() ?? 0) / 30;
    let best = -1;
    p.events.forEach((x, k) => {
      if (x.type === "element" && x.element === id && (best < 0 || Math.abs(x.start - at) < Math.abs(p.events[best].start - at))) best = k;
    });
    if (best >= 0) remove(best);
  };
  const used: Record<string, number> = {};
  for (const x of p.events) if (x.type === "element" && x.element) used[x.element] = (used[x.element] ?? 0) + 1;
  const events = p.events.map((e, i) => [editing?.i === i ? editing.e : e, i] as const);

  return (
    <div className="inspector">
          <span className="hint">{p.graphics_auto === false ? "Style: your choice · Claude keeps it" : "Style chosen by Claude"} · scrub to a card to compare</span>
          <h2>Graphics</h2>
          <p className="lead">Claude plans these. Pick a design for every card and text pop; click any graphic below to change it, or ask Claude on the Overview.</p>
          <div className="section">
            <h3>Style</h3>
            <div className="looks">
              {STYLES.map(([id, name, note, sample]) => (
                <button
                  key={id}
                  type="button"
                  className={"look" + ((p.graphics_style ?? "glass") === id ? " on" : "")}
                  disabled={busy}
                  onClick={() => savePlan({ ...p, graphics_style: id, graphics_auto: false })}
                >
                  <span className={"gsample gs-" + id}>{sample}</span>
                  <span>
                    {name}
                    <small>{note}</small>
                  </span>
                </button>
              ))}
            </div>
            {p.graphics_auto === false ? (
              <button type="button" className="btn secondary small" style={{ marginTop: 10 }} disabled={busy} onClick={() => savePlan({ ...p, graphics_auto: true })}>
                Let Claude choose
              </button>
            ) : null}
          </div>
          <div className="grid">
            <label className="field">
              <span>Progress bar</span>
              <select value={String(p.progress_bar)} disabled={busy} onChange={(e) => savePlan({ ...p, progress_bar: e.target.value === "true" })}>
                <option value="false">Off</option>
                <option value="true">On (top of video)</option>
              </select>
            </label>
          </div>

          <div className="section" style={{ marginTop: 16 }}>
            <h3>Switch effect</h3>
            <p className="hint" style={{ marginTop: -4 }}>
              What plays when the look changes, for the whole video. Click one to watch it in the preview. To give one switch its own
              effect, click it in the list below.
            </p>
            <div className="templates">
              {EFFECTS.map(([id, name, note]) => (
                <button
                  key={id}
                  type="button"
                  className={"tpl" + ((p.transition ?? "bloom") === id ? " on" : "")}
                  disabled={busy}
                  onClick={async () => {
                    await savePlan({ ...p, transition: id });
                    const first = p.events.find((e) => e.type === "flash");
                    if (first) {
                      seek(first.start - 0.6);
                      player.current?.play();
                    }
                  }}
                >
                  {name}
                  <small>{note}</small>
                </button>
              ))}
            </div>
            {(() => {
              const flashes = p.events.filter((e) => e.type === "flash");
              const missing = lookChanges(p.events).filter((t) => !flashes.some((f) => Math.abs(f.start - t) < 0.15));
              return missing.length ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <span className="hint">
                    {flashes.length ? `${missing.length} look changes have no effect.` : "No effects in this video yet."}
                  </span>
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={busy}
                    onClick={() =>
                      savePlan({ ...p, events: [...p.events, ...missing.map((t) => ({ ...BLANK, type: "flash" as const, start: t, end: t + 0.3 }))] }).then(() =>
                        toast(`Effect added at ${missing.length} look ${missing.length === 1 ? "change" : "changes"}.`),
                      )
                    }
                  >
                    Add at every look change
                  </button>
                </div>
              ) : null;
            })()}
          </div>


          <div className="section" style={{ marginTop: 16 }}>
            <h3>Images & screen recordings</h3>
            <label className="dropzone" style={{ padding: 18 }}>
              <strong style={{ fontSize: 14 }}>{uploading || "＋ Add images or screen recordings"}</strong>
              <span className="hint">PNG, JPG, WebP, GIF · MP4 or MOV recordings · images can also be your background</span>
              <input
                type="file"
                multiple
                disabled={!!uploading}
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mov,.m4v"
                onChange={(e) => {
                  upload([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="thumbs">
              {job.assets.map((name) => (
                <div key={name} className="thumb">
                  <img src={fileUrl(job.id, "assets/" + name)} alt={name} />
                  <span>{name}</span>
                  <button type="button" className="btn secondary small" onClick={() => removeAsset(name)}>Remove</button>
                </div>
              ))}
              {job.clips.map((c) => (
                <div key={c.name} className="thumb">
                  {c.poster ? <img src={c.poster} alt={c.name} style={{ objectFit: "cover" }} /> : null}
                  <span>▶ {clock(c.duration)} · {c.name}</span>
                  <button type="button" className="btn secondary small" onClick={() => removeAsset(c.name)}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="ai">
            <label className="field">
              <span>Re-plan graphics only (optional notes)</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Show the app recording when I say “here’s how it works”, split screen. Big zoom on the price." />
            </label>
            <div className="row">
              <span className="hint">Replaces the graphics plan. No new draft is rendered.</span>
              <button
                type="button"
                className="btn secondary"
                disabled={job.state === "running" || !setup.planner_available}
                onClick={() => {
                  const d = new FormData();
                  d.set("notes", notes);
                  setJsonDirty(false);
                  post("plan/auto", d);
                }}
              >
                ✨ Auto-plan graphics
              </button>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>
              Planned graphics <span className="hint">· {p.events.length}{saving ? " · saving…" : ""}</span>
            </h3>
            <div className="row">
              <button type="button" className="btn secondary small" disabled={busy} onClick={() => add("text")}>
                ＋ Text
              </button>
              <button type="button" className="btn secondary small" disabled={busy} onClick={() => add("card")}>
                ＋ Card
              </button>
              <button type="button" className="btn secondary small" onClick={() => document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })}>
                ＋ From library
              </button>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>Click a graphic to change it. New ones start where the preview is paused.</p>
          {p.notes ? <p className="hint">Claude: {p.notes}</p> : null}
          <div className="events">
            {!p.events.length ? <div className="empty">No graphics yet. Captions are always added.</div> : null}
            {events.map(([e, i]) => {
              const [kind, text] = describe(e);
              const on = editing?.i === i;
              return (
                <div key={i} className={"evwrap" + (on ? " on" : "")}>
                  <div className="ev" role="button" tabIndex={0} onClick={() => open(i)} onKeyDown={(k) => k.key === "Enter" && open(i)}>
                    <time>
                      {clock(e.start)}
                      {e.end - e.start > 0.5 ? "–" + clock(e.end) : ""}
                    </time>
                    <span>
                      <span className="kind">{kind}</span>
                      {text}
                    </span>
                    <button
                      type="button"
                      title="Remove"
                      disabled={busy}
                      onClick={(x) => {
                        x.stopPropagation();
                        remove(i);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {on ? (
                    <EventEditor
                      event={editing.e}
                      issue={problem(editing.e, others(i))}
                      video={p.transition ?? "bloom"}
                      palette={Object.entries(setup.palette)}
                      looks={looks}
                      images={job.assets}
                      clips={job.clips.map((c) => c.name)}
                      onChange={(next) => edit(i, next)}
                    />
                  ) : null}
                  {on ? (
                    <div className="row" style={{ justifyContent: "flex-end", padding: "0 12px 12px" }}>
                      {e.type === "element" || e.type === "card" || e.type === "text" ? (
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={busy}
                          onClick={() => {
                            setSwapping(true);
                            document.getElementById("library")?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          Swap for another graphic
                        </button>
                      ) : null}
                      <button type="button" className="btn ghost small" disabled={busy} onClick={() => remove(i)}>
                        Remove this graphic
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Library
            style={p.graphics_style}
            accent={p.highlight_color}
            disabled={busy}
            used={used}
            swapping={swapping && editing ? describe(editing.e).join(": ") + " at " + clock(editing.e.start) : undefined}
            onCancelSwap={() => setSwapping(false)}
            onAdd={(m) => (swapping && editing ? swapElement(m) : addElement(m))}
            onRemove={removeElement}
            toast={toast}
          />

          <div className="row" style={{ marginTop: 10 }}>
            <span className="hint">Hide captions from</span>
            <input style={{ width: 80 }} placeholder="0:12" value={nocap.start} onChange={(e) => setNocap({ ...nocap, start: e.target.value })} aria-label="Hide captions from" />
            <span className="hint">to</span>
            <input style={{ width: 80 }} placeholder="0:18" value={nocap.end} onChange={(e) => setNocap({ ...nocap, end: e.target.value })} aria-label="Hide captions until" />
            <button
              type="button"
              className="btn secondary small"
              disabled={busy}
              onClick={() => {
                const start = seconds(nocap.start);
                const end = seconds(nocap.end);
                if (!(start >= 0 && end > start)) {
                  toast("Enter a start and a later end, like 0:12 and 0:18.", true);
                  return;
                }
                savePlan({ ...p, events: [...p.events, { type: "no_captions", start, end } as ShortEvent] }).then(() => setNocap({ start: "", end: "" }));
              }}
            >
              Hide captions here
            </button>
          </div>
          {job.warnings.length ? (
            <ul className="warnings">
              {job.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <details style={{ marginTop: 14 }}>
            <summary>Advanced · edit the plan as JSON</summary>
            <textarea
              className="code"
              spellCheck={false}
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setJsonDirty(true);
              }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={() => {
                  let parsed;
                  try {
                    parsed = JSON.parse(json);
                  } catch {
                    toast("That JSON has a mistake.", true);
                    return;
                  }
                  setJsonDirty(false);
                  savePlan(parsed).then(() => toast("Plan saved."));
                }}
              >
                Save JSON
              </button>
              <span className="hint">Times are seconds in your edit. Hand left/right = screen side.</span>
            </div>
          </details>
    </div>
  );
};
