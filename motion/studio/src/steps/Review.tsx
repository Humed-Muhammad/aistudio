import { useState } from "react";
import { clock, fileUrl } from "../api";
import type { JobApi } from "../JobView";
import { Preview } from "../Preview";
import { lookName } from "./Look";

/** The hands-off screen: start the automatic edit, then watch what Claude made and ask for changes in words. */
export const Review: React.FC<JobApi> = (ctx) => {
  const { job } = ctx;
  if (!job.cut) {
    return (
      <div className="card">
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
    <div className="card">
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

type View = "live" | "draft" | "source";

const Result: React.FC<JobApi> = ({ job, busy, setup, post, goto }) => {
  const draft = job.files["shorts-draft.mp4"];
  const [view, setView] = useState<View>(draft ? "draft" : "live");
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"graphics" | "edit">("graphics");
  const plan = job.plan;
  const look = plan?.background;
  const removed = job.cut?.removed ?? [];
  const stale = !!draft && !!job.files["source.mp4"] && (job.files["plan.json"] ?? 0) > draft;
  const counts: Record<string, number> = {};
  for (const e of plan?.events ?? []) if (e.type !== "sfx") counts[e.type] = (counts[e.type] ?? 0) + 1;
  const NAMES: Record<string, [string, string]> = {
    card: ["card", "cards"],
    text: ["text pop", "text pops"],
    zoom: ["zoom", "zooms"],
    broll: ["screen cut-in", "screen cut-ins"],
    sticker: ["image", "images"],
    shake: ["shake", "shakes"],
    flash: ["flash", "flashes"],
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
    <div className="card">
      <div className="studio">
        <div className="stage">
          <div className="seg">
            <button type="button" className={view === "live" ? "on" : ""} onClick={() => setView("live")}>
              Live preview
            </button>
            <button type="button" className={view === "draft" ? "on" : ""} disabled={!draft} onClick={() => setView("draft")}>
              Rendered draft
            </button>
            <button type="button" className={view === "source" ? "on" : ""} onClick={() => setView("source")}>
              Plain cut
            </button>
          </div>
          {view === "live" ? (
            <Preview id={job.id} version={JSON.stringify(plan) + job.files["source.mp4"]} />
          ) : (
            <div className="frame">
              <video
                key={view}
                src={fileUrl(job.id, view === "draft" ? "shorts-draft.mp4" : "source.mp4", view === "draft" ? draft : job.files["source.mp4"])}
                controls
                playsInline
                style={{ width: "100%", height: "100%", background: "#000" }}
              />
            </div>
          )}
          <span className="hint">
            {view === "live"
              ? "Plays the edit live, exactly as it will render. Space to play."
              : view === "draft"
                ? "Half-resolution draft render."
                : "Your cut with your original voice, no graphics."}
          </span>
        </div>

        <div>
          <h2>{draft ? "Your draft is ready" : "Your edit is built"}</h2>
          <p className="lead">{draft ? "Watch it. If you like it, render the final. If not, say what to change." : "Graphics and a draft come next."}</p>
          {stale ? <div className="stale">You changed things after this draft. The live preview shows the latest; render a new draft to update the file.</div> : null}

          <div className="facts">
            {job.cut_summary ? (
              <div className="fact">
                <span>Cut</span>
                <b>
                  {clock(job.cut_summary.original)} → {clock(job.manifest?.duration)}
                  {removed.length ? ` · ${removed.length} parts removed` : ""}
                </b>
              </div>
            ) : null}
            <div className="fact">
              <span>Look</span>
              <b>{look ? lookName(look) : "Original"}</b>
            </div>
            <div className="fact">
              <span>Captions</span>
              <b style={{ textTransform: "capitalize" }}>{plan?.caption_preset ?? "–"}</b>
            </div>
            <div className="fact">
              <span>Graphics</span>
              <b>
                {Object.entries(counts)
                  .map(([k, n]) => `${n} ${NAMES[k]?.[n === 1 ? 0 : 1] ?? k}`)
                  .join(" · ") || "none yet"}
              </b>
            </div>
          </div>
          {job.cut?.summary ? <p className="hint" style={{ marginTop: 12 }}>Claude (cut): {job.cut.summary}</p> : null}
          {plan?.notes ? <p className="hint">Claude (graphics): {plan.notes}</p> : null}
          {job.warnings.length ? (
            <ul className="warnings">
              {job.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="ai" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Want changes? Say it in your words</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Darker background. Fewer text pops. Show the steps card when I list the three features. Keep the joke at the start."
              />
            </label>
            <div className="row">
              <div className="seg">
                <button type="button" className={scope === "graphics" ? "on" : ""} onClick={() => setScope("graphics")}>
                  Look & graphics
                </button>
                <button type="button" className={scope === "edit" ? "on" : ""} onClick={() => setScope("edit")}>
                  Whole edit incl. cut
                </button>
              </div>
              <button type="button" className="btn" disabled={busy || !notes.trim() || !setup.planner_available} onClick={ask}>
                Ask Claude →
              </button>
            </div>
            <span className="hint">
              {setup.planner_available
                ? scope === "graphics"
                  ? "Claude updates the look and graphics, then renders a new draft (about a minute plus the render)."
                  : "Claude redoes the cut too; the edit is rebuilt and tracked again (takes longer)."
                : "Add ANTHROPIC_API_KEY to .env, or ask Claude Code for the change."}
            </span>
          </div>

          <div className="footer">
            <div className="row">
              {draft ? (
                <a className="btn secondary small" href={fileUrl(job.id, "shorts-draft.mp4", draft)} download>
                  Download draft ↓
                </a>
              ) : null}
              <button type="button" className="btn secondary small" onClick={() => goto("look")}>
                Adjust by hand
              </button>
            </div>
            {job.files["shorts-final.mp4"] ? (
              <a className="btn" href={fileUrl(job.id, "shorts-final.mp4", job.files["shorts-final.mp4"])} download>
                Download final ↓
              </a>
            ) : (
              <button type="button" className="btn" disabled={busy || !draft} onClick={final}>
                Looks good · render final →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
