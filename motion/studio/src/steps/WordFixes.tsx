import { useEffect, useState } from "react";
import { api, jobUrl, sendJSON, type Job } from "../api";
import type { JobApi } from "../JobView";

/** Claude proofreads the transcript (misheard Amharic, broken words); the creator reviews every fix before it applies. */
export const WordFixes: React.FC<JobApi> = ({ job, busy, setup, show, post, toast }) => {
  const fixes = job.word_fixes;
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [text, setText] = useState<Record<number, string>>({});
  const key = fixes.map((f) => f.id + f.new).join("|");
  useEffect(() => {
    setPicked(Object.fromEntries(fixes.map((f) => [f.id, true])));
    setText(Object.fromEntries(fixes.map((f) => [f.id, f.new])));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = fixes.filter((f) => picked[f.id]);
  const apply = async () => {
    try {
      const j = await sendJSON<Job>(jobUrl(job.id, "fixes/apply"), "POST", {
        edits: Object.fromEntries(chosen.map((f) => [f.id, text[f.id] ?? f.new])),
      });
      show(j);
      toast(
        !j.tracking
          ? `${chosen.length} fixes applied.`
          : j.captions_updated
            ? `${chosen.length} fixes applied. Captions updated: render a new draft to see them in the file.`
            : `${chosen.length} fixes applied. One of them changes where the edit cuts, so rebuild your edit to use it.`,
      );
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const discard = async () => {
    try {
      show(await api(jobUrl(job.id, "fixes"), { method: "DELETE" }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="ai">
      <div className="row">
        <b>✨ Fix the words with Claude</b>
        <span className="hint">Misheard Amharic, broken or joined words, odd spellings of English words.</span>
      </div>
      {fixes.length ? (
        <>
          <div className="fixes">
            {fixes.map((f) => (
              <label key={f.id} className={"fix-row" + (picked[f.id] ? "" : " off")}>
                <input type="checkbox" checked={!!picked[f.id]} onChange={(e) => setPicked({ ...picked, [f.id]: e.target.checked })} />
                <div>
                  <div className="old" dir="auto">{f.old}</div>
                  <input
                    dir="auto"
                    value={text[f.id] ?? f.new}
                    onChange={(e) => setText({ ...text, [f.id]: e.target.value })}
                    onClick={(e) => e.preventDefault()}
                    aria-label={`Corrected text for part ${f.id}`}
                  />
                  <small>{f.why}</small>
                </div>
              </label>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="hint">Untick or edit anything that's wrong. Only the words change; timing and audio stay.</span>
            <div className="row">
              <button type="button" className="btn ghost small" disabled={busy} onClick={discard}>
                Discard
              </button>
              <button type="button" className="btn" disabled={busy || !chosen.length} onClick={apply}>
                Apply {chosen.length} {chosen.length === 1 ? "fix" : "fixes"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional: facts Claude should know, e.g. “Video about my AI editing workflow. podcast = ፖድካስት, I say TikTok and AI in English.”"
          />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="hint">
              {setup.planner_available
                ? "Claude suggests fixes; you check each one before anything changes. One Claude call."
                : "Add ANTHROPIC_API_KEY to .env to use this, or fix parts one by one with ✎ Edit below."}
            </span>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !setup.planner_available}
              onClick={() => {
                const d = new FormData();
                d.set("notes", notes);
                post("fixes", d);
              }}
            >
              Check the words
            </button>
          </div>
        </>
      )}
    </div>
  );
};
