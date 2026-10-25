import { useState } from "react";
import { clock } from "../api";
import type { JobApi } from "../JobView";
import { lookName } from "./Look";

/** The hands-off screen: start the automatic edit, then watch what Claude made and ask for changes in words. */
export const Review: React.FC<JobApi> = (ctx) => {
  const { job } = ctx;
  if (!job.cut) {
    return (
      <div className="inspector">
        <h2>Transcribing your recording</h2>
        <p className="lead">This runs on your Mac (Amharic uses ElevenLabs). You can leave this page and come back.</p>
      </div>
    );
  }
  if (!job.tracking) return <Start {...ctx} />;
  return <Result {...ctx} key={job.id} />;
};

const Start: React.FC<JobApi> = ({ job, busy, setup, post, goto }) => {
  const [notes, setNotes] = useState("");
  const go = () => {
    const d = new FormData();
    d.set("notes", notes);
    post("auto", d);
  };
  return (
    <div className="inspector">
      <h2>Your transcript is ready</h2>
      <p className="lead">
        {job.cut_summary ? `${clock(job.cut_summary.original)} recorded, ${job.units.length} parts. ` : ""}
        Let Claude make the whole edit, or choose the cut yourself.
      </p>
      <div className="ai">
        <label className="field">
          <span>Anything Claude should know? (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Keep the pricing story and the ending. Drop the intro about my week. Dark premium look."
          />
        </label>
        <div className="row">
          <span className="hint">
            {setup.planner_available
              ? "Cut → build and track → background look and graphics → draft. About 2–4× the video length."
              : "Add ANTHROPIC_API_KEY to .env to use this, or ask Claude Code: “edit shorts job " + job.id + "”."}
          </span>
          <button type="button" className="btn" disabled={busy || !setup.planner_available} onClick={go}>
            ✨ Edit it for me
          </button>
        </div>
      </div>
      <div className="footer">
        <span className="hint">Prefer to decide yourself? Pick the parts to keep, then build.</span>
        <button type="button" className="btn secondary" onClick={() => goto("cut")}>
          Choose the cut myself →
        </button>
      </div>
    </div>
  );
};

const Result: React.FC<JobApi> = ({ job, busy, setup, post, goto }) => {
  const draft = job.files["shorts-draft.mp4"];
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"graphics" | "edit">("graphics");
  const plan = job.plan;
  const look = plan?.background;
  const removed = job.cut?.removed ?? [];
  const counts: Record<string, number> = {};
  for (const e of plan?.events ?? []) if (e.type !== "sfx") counts[e.type] = (counts[e.type] ?? 0) + 1;
  const NAMES: Record<string, [string, string]> = {
    card: ["card", "cards"],
    text: ["text pop", "text pops"],
    zoom: ["zoom", "zooms"],
    broll: ["screen cut-in", "screen cut-ins"],
    sticker: ["image", "images"],
    shake: ["shake", "shakes"],
    flash: ["effect", "effects"],
    look: ["look switch", "look switches"],
    no_captions: ["caption pause", "caption pauses"],
  };
  const ask = () => {
    const d = new FormData();
    d.set("notes", notes);
    d.set("scope", scope);
    post("revise", d).then(() => setNotes(""));
  };
  const final = () => {
    const d = new FormData();
    d.set("final", "true");
    post("render", d);
  };

  return (
    <div className="inspector">
      <h2>{job.files["shorts-final.mp4"] ? "Final is ready" : draft ? "Your draft is ready" : "Your edit is built"}</h2>
      <p className="lead">{draft ? "Watch it in the middle. Like it? Render the final. If not, say what to change." : "Render a draft, or adjust anything first."}</p>

      <div className="facts">
        {job.cut_summary ? (
          <button type="button" className="fact" onClick={() => goto("cut")}>
            <span>Cut</span>
            <b>
              {clock(job.cut_summary.original)} → {clock(job.manifest?.duration)}
              {removed.length ? ` · ${removed.length} removed` : ""}
            </b>
          </button>
        ) : null}
        <button type="button" className="fact" onClick={() => goto("look")}>
          <span>Look</span>
          <b>{look ? lookName(look) : "Original"}</b>
        </button>
        <button type="button" className="fact" onClick={() => goto("captions")}>
          <span>Captions</span>
          <b style={{ textTransform: "capitalize" }}>{plan?.caption_preset ?? "–"}</b>
        </button>
        <button type="button" className="fact" onClick={() => goto("graphics")}>
          <span>Graphics</span>
          <b>
            {Object.entries(counts)
              .map(([k, n]) => `${n} ${NAMES[k]?.[n === 1 ? 0 : 1] ?? k}`)
              .join(" · ") || "none yet"}
          </b>
        </button>
      </div>

      {job.cut?.summary || plan?.notes ? (
        <details className="claudenotes">
          <summary>What Claude did</summary>
          {job.cut?.summary ? <p><b>Cut.</b> {job.cut.summary}</p> : null}
          {plan?.notes ? <p><b>Look & graphics.</b> {plan.notes}</p> : null}
        </details>
      ) : null}
      {job.warnings.length ? (
        <ul className="warnings">
          {job.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="ai" style={{ marginTop: 16 }}>
        <label className="field">
          <span>Redo the edit with Claude</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Darker background. Fewer text pops. Show the steps card when I list the three features."
          />
        </label>
        <div className="row">
          <div className="seg">
            <button type="button" className={scope === "graphics" ? "on" : ""} onClick={() => setScope("graphics")}>
              Look & graphics
            </button>
            <button type="button" className={scope === "edit" ? "on" : ""} onClick={() => setScope("edit")}>
              Whole edit
            </button>
          </div>
          <button type="button" className="btn" disabled={busy || !notes.trim() || !setup.planner_available} onClick={ask}>
            Ask Claude →
          </button>
        </div>
        <span className="hint">
          {setup.planner_available
            ? scope === "graphics"
              ? "Plans the look and graphics again, then renders a new draft. For one change, use the chat on the left."
              : "Redoes the cut too; the edit is rebuilt and tracked again (takes longer)."
            : "Add ANTHROPIC_API_KEY to .env, or ask Claude Code for the change."}
        </span>
      </div>

      <div className="footer">
        <button type="button" className="btn secondary small" onClick={() => goto("look")}>
          Adjust by hand
        </button>
        {job.files["shorts-final.mp4"] ? (
          <button type="button" className="btn" onClick={() => goto("export")}>
            Deliver →
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy || !draft} onClick={final}>
            Looks good · render final →
          </button>
        )}
      </div>
    </div>
  );
};
