import { useEffect, useState } from "react";
import type { ShortEvent } from "../../../src/types";
import { api, clock, fileUrl, jobUrl, sendJSON } from "../api";
import type { JobApi } from "../JobView";
import { Preview } from "../Preview";

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
    return [e.template, `${what} · ${scene}`];
  }
  if (e.type === "no_captions") return ["No captions", "captions hidden for these words"];
  if (e.type === "look") return ["Look", `switch to ${e.look === "original" ? "your real room" : e.look}`];
  if (e.type === "sfx") return ["Sound", e.sound];
  return [e.type, ""];
};

const seconds = (v: string) => {
  v = v.trim();
  if (!v) return NaN;
  const [m, s] = v.includes(":") ? v.split(":") : ["0", v];
  return Number(m) * 60 + Number(s);
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
];

export const Graphics: React.FC<JobApi> = ({ job, busy, setup, show, post, savePlan, toast }) => {
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
  const events = p.events.map((e, i) => [e, i] as const);

  return (
    <div className="card">
      <div className="studio">
        <div className="stage">
          <Preview id={job.id} version={JSON.stringify(p) + job.files["source.mp4"]} />
          <span className="hint">{p.graphics_auto === false ? "Style: your choice · Claude keeps it" : "Style chosen by Claude"} · scrub to a card to compare</span>
        </div>
        <div>
          <h2>Graphics</h2>
          <p className="lead">Claude plans these. Pick a design for every card and text pop; ask for content changes on the Review tab.</p>
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
            <label className="field">
              <span>Voice volume</span>
              <select
                value={job.voice}
                disabled={busy}
                onChange={async (e) => {
                  try {
                    show(await sendJSON(jobUrl(job.id), "PATCH", { voice: e.target.value }));
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                <option value="level">Even & loud (recommended)</option>
                <option value="off">As recorded</option>
              </select>
            </label>
            <label className="field">
              <span>Sound design</span>
              <select value={String(p.auto_sound !== false)} disabled={busy} onChange={(e) => savePlan({ ...p, auto_sound: e.target.value === "true" })}>
                <option value="true">Automatic</option>
                <option value="false">Only sounds in the plan</option>
              </select>
            </label>
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
                disabled={busy || !setup.planner_available}
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

          <h3>
            Planned graphics <span className="hint">· {p.events.length}</span>
          </h3>
          {p.notes ? <p className="hint">Claude: {p.notes}</p> : null}
          <div className="events">
            {!p.events.length ? <div className="empty">No graphics yet. Captions are always added.</div> : null}
            {events.map(([e, i]) => {
              const [kind, text] = describe(e);
              return (
                <div key={i} className="ev">
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
                    onClick={() => {
                      const q = structuredClone(p);
                      q.events.splice(i, 1);
                      savePlan(q);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
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
      </div>
    </div>
  );
};
