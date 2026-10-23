import { useState } from "react";
import { clock, jobUrl, sendJSON, type Cut as CutPlan, type Job } from "../api";
import type { JobApi } from "../JobView";

type Filter = "all" | "kept" | "removed";

export const Cut: React.FC<JobApi> = ({ job, busy, setup, show, post, toast }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const c = job.cut!;
  const s = job.cut_summary;

  const save = async (cut: CutPlan) => {
    try {
      show(await sendJSON(jobUrl(job.id, "cut"), "PUT", cut));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const patch = async (body: object) => {
    try {
      show(await sendJSON(jobUrl(job.id), "PATCH", body));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  // A hook (a later part moved to the front) stays first.
  const hook = c.keep.length > 1 && c.keep[0] > c.keep[1] ? c.keep[0] : null;
  const keep = new Set(c.keep);
  const toggle = (id: number, on: boolean) => {
    const rest = c.keep.filter((k) => k !== id && k !== hook);
    if (on) rest.push(id);
    rest.sort((a, b) => a - b);
    save({ ...c, keep: hook !== null && hook !== id ? [hook, ...rest] : rest });
  };
  const saveText = async (id: number, text: string) => {
    if (!text.trim()) {
      toast("A part needs at least one word. To drop it, uncheck it instead.", true);
      return;
    }
    try {
      const j = await sendJSON<Job>(jobUrl(job.id, `units/${id}`), "PUT", { text });
      setEditing(null);
      show(j);
      if (j.tracking)
        toast(
          j.captions_updated
            ? "Saved. The captions in your edit now use the corrected words."
            : "Saved. This correction changes where the edit cuts, so rebuild your edit to use it.",
        );
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const why = Object.fromEntries((c.removed || []).map((r) => [r.id, r.why]));
  const rows = job.units.filter((u) => filter === "all" || (filter === "kept") === keep.has(u.id));
  const tc = job.transcript_check;
  const lost = !!tc && tc.speech > 0 && tc.missing > Math.max(5, 0.1 * tc.speech);
  const stale =
    !!job.files["source.mp4"] &&
    ((job.cut_mtime ?? 0) > job.files["source.mp4"] || (!!job.manifest && (job.manifest.noise || "off") !== job.noise));

  return (
    <div className="card">
      <h2>Keep what matters</h2>
      <p className="lead">Unchecked parts are cut. Retakes, repeated points and dead air go; the length follows the content.</p>
      <div className="numbers">
        <div>
          <strong>{clock(s?.original)}</strong>
          <span>recorded</span>
        </div>
        <span className="arrow">→</span>
        <div>
          <strong>{clock(s?.kept)}</strong>
          <span>your edit</span>
        </div>
        <div>
          <strong>
            {s?.kept_parts ?? "–"}/{s?.parts ?? "–"}
          </strong>
          <span>parts kept</span>
        </div>
        {s && !s.whole ? (
          <div>
            <strong>{s.jumps ?? "–"}</strong>
            <span>pieces joined</span>
          </div>
        ) : null}
      </div>

      <div className="ai">
        <label className="field">
          <span>Tell Claude what matters (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Keep the pricing story and the ending. Drop the intro about my week." />
        </label>
        <div className="row">
          <span className="hint">
            {setup.planner_available
              ? "Claude unchecks retakes, repeats, tangents and dead air. You can change anything after."
              : `Add ANTHROPIC_API_KEY to .env to use this, or ask Claude Code: “cut shorts job ${job.id}”.`}
          </span>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !setup.planner_available}
            onClick={() => {
              const d = new FormData();
              d.set("notes", notes);
              post("cut/auto", d);
            }}
          >
            ✨ Auto-cut only
          </button>
        </div>
      </div>

      {lost ? (
        <div className="problem">
          <b>Some of your speech wasn’t transcribed</b>
          <p>
            About {Math.round(tc!.missing)} s of speech has no transcript (detected language: {job.transcript.language || "unknown"}). Those words
            can’t be shown as captions or chosen in the cut. Check the language and transcribe again.
          </p>
          <div className="row">
            <select defaultValue={job.language} style={{ width: "auto" }} id="relang">
              <option value="am">Amharic (with English words)</option>
              <option value="en">English only</option>
              <option value="auto">Detect automatically</option>
            </select>
            <button
              type="button"
              className="btn small"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Transcribe again? This replaces the transcript and your cut choices, and uses ElevenLabs credits.")) return;
                await patch({ language: (document.getElementById("relang") as HTMLSelectElement).value });
                post("transcribe");
              }}
            >
              Transcribe again
            </button>
          </div>
        </div>
      ) : null}
      {c.summary ? <p className="hint">Claude: {c.summary}</p> : null}

      <div className="toolbar">
        <div className="seg">
          {(["all", "kept", "removed"] as Filter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All parts" : f === "kept" ? "Kept" : "Cut"}
            </button>
          ))}
        </div>
        <button type="button" className="btn secondary small" disabled={busy} onClick={() => save({ ...c, keep: job.units.map((u) => u.id), removed: [] })}>
          Keep all
        </button>
        <label className="check" style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={c.tighten} disabled={busy} onChange={(e) => save({ ...c, tighten: e.target.checked })} />
          Also remove “um/uh” and long pauses
        </label>
        <label className="check">
          Noise
          <select value={job.noise} disabled={busy} style={{ width: "auto" }} onChange={(e) => patch({ noise: e.target.value })}>
            <option value="off">Original audio</option>
            <option value="light">Light (free)</option>
            <option value="strong" disabled={!job.strong_noise_available && job.noise !== "strong"}>
              Strong (ElevenLabs, ~1,000 credits/min)
            </option>
          </select>
        </label>
      </div>

      <div className="parts">
        {rows.length ? null : <div className="empty" style={{ border: 0 }}>Nothing here.</div>}
        {rows.map((u) => {
          const on = keep.has(u.id);
          return (
            <label key={u.id} className={"part" + (on ? "" : " off")}>
              <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(u.id, e.target.checked)} />
              <time>{clock(u.start)}</time>
              {editing?.id === u.id ? (
                <div onClick={(e) => e.preventDefault()}>
                  <textarea
                    dir="auto"
                    autoFocus
                    rows={Math.min(6, Math.max(2, Math.ceil(editing.text.length / 70)))}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: u.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveText(u.id, editing.text);
                      } else if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                    <span className="hint" style={{ marginRight: "auto" }}>Fix the words only. The timing and audio stay the same.</span>
                    <button type="button" className="btn secondary small" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="btn small" onClick={() => saveText(u.id, editing.text)}>Save</button>
                  </div>
                </div>
              ) : (
                <span className="text" dir="auto">
                  {busy ? null : (
                    <button
                      type="button"
                      className="btn secondary small fix"
                      title="Fix wrong words in this part"
                      onClick={(e) => {
                        e.preventDefault();
                        setEditing({ id: u.id, text: u.text });
                      }}
                    >
                      ✎ Edit
                    </button>
                  )}
                  {u.text}
                  {u.edited ? <span className="tag ok">corrected</span> : null}
                  {u.id === hook ? <span className="tag accent">HOOK · plays first</span> : null}
                  {!on && why[u.id] ? <span className="why">Cut: {why[u.id]}</span> : null}
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="footer">
        <span className="hint">
          {stale
            ? "You changed the cut or noise setting. Rebuild to update your edit (graphics will be reset)."
            : job.tracking
              ? "Your edit is built. Rebuilding resets the graphics plan; your chosen look is kept."
              : "Next, your edit is built and tracked, with your cutout for backgrounds. Nothing is uploaded."}
        </span>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            if (job.plan?.events.length && !confirm("Rebuilding resets your planned graphics. Continue?")) return;
            post("cut/apply");
          }}
        >
          {job.tracking ? (stale ? "Rebuild my edit →" : "Rebuild my edit") : "Build my edit →"}
        </button>
      </div>
    </div>
  );
};
