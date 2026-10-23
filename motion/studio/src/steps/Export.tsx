import { useState } from "react";
import { fileUrl, jobUrl, sendJSON } from "../api";
import type { JobApi } from "../JobView";

const OUTPUTS: [string, string, string, string][] = [
  ["shorts-draft.mp4", "Draft", "Half resolution · about 3× the video length", "draft"],
  ["shorts-final.mp4", "Final", "Full quality, ready to post", "final"],
];

export const Export: React.FC<JobApi> = ({ job, busy, setup, post, toast, show }) => {
  const render = (final: boolean) => {
    const d = new FormData();
    d.set("final", String(final));
    post("render", d);
  };
  const stage = async (delivery: "" | "sent" | "delivered") => {
    try {
      show(await sendJSON(jobUrl(job.id), "PATCH", { delivery }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="inspector">
      <h2>Deliver</h2>
      <p className="lead">Render on this Mac, send the file, and track where it is with the client.</p>
      <div className="exports">
        {OUTPUTS.map(([file, title, hint, kind]) => (
          <div key={file} className={"export" + (job.files[file] ? " ready" : "")}>
            <h3>{title}</h3>
            <span className="hint">{hint}</span>
            <div className="row">
              <button type="button" className={"btn small" + (kind === "draft" ? " secondary" : "")} disabled={busy} onClick={() => render(kind === "final")}>
                {job.files[file] ? `Re-render` : `Render ${kind}`}
              </button>
              {job.files[file] ? (
                <a className="btn secondary small" href={fileUrl(job.id, file, job.files[file])} download={`${job.title}${kind === "draft" ? " (draft)" : ""}.mp4`}>
                  Download ↓
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <h3>With the client</h3>
        <div className="seg">
          {(
            [
              ["", "Not sent"],
              ["sent", "Sent for review"],
              ["delivered", "Delivered ✓"],
            ] as const
          ).map(([id, name]) => (
            <button key={id} type="button" className={job.delivery === id ? "on" : ""} onClick={() => stage(id)}>
              {name}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Shown on the Videos page, so you always know what is waiting on whom.</p>
      </div>

      <PostText job={job} busy={busy} setup={setup} post={post} toast={toast} />
    </div>
  );
};

/** Title options, description and hashtags to paste into TikTok; one Claude call, written from the edit's words. */
const PostText: React.FC<Pick<JobApi, "job" | "busy" | "setup" | "post" | "toast">> = ({ job, busy, setup, post, toast }) => {
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState(0);
  const p = job.post;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast("Could not copy. Select the text and copy it instead.", true);
    }
  };
  const tags = p ? p.hashtags.join(" ") : "";
  const write = () => {
    const d = new FormData();
    d.set("notes", notes);
    post("post", d);
  };
  return (
    <div className="section" style={{ marginTop: 18 }}>
      <h3>Post it</h3>
      {p ? (
        <div className="posttext">
          <div className="field">
            <span>Title · pick one</span>
            {p.titles.map((t, i) => (
              <label key={i} className={"postrow" + (title === i ? " on" : "")}>
                <input type="radio" name="title" checked={title === i} onChange={() => setTitle(i)} />
                <span dir="auto">{t}</span>
                <button type="button" className="btn secondary small" onClick={() => copy(t, "Title")}>
                  Copy
                </button>
              </label>
            ))}
          </div>
          <div className="field">
            <span>Description</span>
            <div className="postbox" dir="auto">{p.caption}</div>
            <button type="button" className="btn secondary small" onClick={() => copy(p.caption, "Description")}>
              Copy description
            </button>
          </div>
          <div className="field">
            <span>Hashtags</span>
            <div className="postbox">{tags}</div>
            <button type="button" className="btn secondary small" onClick={() => copy(tags, "Hashtags")}>
              Copy hashtags
            </button>
          </div>
          {p.best_time ? <p className="hint">🕖 {p.best_time}</p> : null}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn" onClick={() => copy(`${p.titles[title] ?? ""}\n\n${p.caption}\n\n${tags}`, "Title, description and hashtags")}>
              Copy all for TikTok
            </button>
            <button type="button" className="btn ghost small" disabled={busy || !setup.planner_available} onClick={write}>
              Write again
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginTop: -4 }}>Claude writes 3 title options, the description and hashtags from what you say in the video.</p>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: anything to mention, e.g. “Part 1 of my AI editing series” or a link in bio." />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="hint">
              {setup.planner_available ? "One Claude call." : `Add ANTHROPIC_API_KEY to .env, or ask Claude Code: “write the post for shorts job ${job.id}”.`}
            </span>
            <button type="button" className="btn secondary" disabled={busy || !setup.planner_available || !job.tracking} onClick={write}>
              ✨ Write title, description & hashtags
            </button>
          </div>
        </>
      )}
    </div>
  );
};
