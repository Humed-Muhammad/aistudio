import { useEffect, useState } from "react";
import type { Script, Section, VideoState } from "./channelApi";
import { Markdown } from "./Markdown";

const KIND: Record<Section["kind"], string> = {
  hook: "Hook",
  intro: "Promise",
  chapter: "Chapter",
  rehook: "Re-hook",
  outro: "Outro",
};
const WPM = 150;
/** Delivery cues the voice performs ([curious], [short pause]); they are not spoken words. */
export const TAGS = /\[[^[\]\n]{1,40}\]/g;

/**
 * The script, as the narrator will read it. The creator edits paragraphs and chapter titles directly, then approves
 * it: that review is their creative input (YouTube asks for it) and unlocks the voice-over in Make it for me.
 */
export const ScriptTab: React.FC<{
  v: VideoState;
  busy: boolean;
  save: (s: Script) => Promise<void>;
  write: (model: string) => void;
  approve: (on: boolean) => void;
  perform: (model: string) => void;
  models: Record<string, string>;
}> = ({ v, busy, save, write, approve, perform, models }) => {
  const [draft, setDraft] = useState<Script>(v.script);
  const [dirty, setDirty] = useState(false);
  const [model, setModel] = useState("sonnet");
  const [showSources, setShowSources] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(v.script);
  }, [v.script, dirty]);
  const words = draft.sections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + p.text.replace(TAGS, " ").split(/\s+/).filter(Boolean).length, 0), 0);
  const edit = (si: number, fn: (s: Section) => Section) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === si ? fn(s) : s)),
    }));
    setDirty(true);
  };
  const commit = async () => {
    await save(draft);
    setDirty(false);
  };

  if (!v.script.sections.length)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>No script yet</h3>
        <p className="lead">
          Claude Code researches “{v.job.topic}” on the web, notes every source, and writes a {v.job.minutes}-minute narration following the channel style guide: hook, promise,
          chapters, a re-hook and the payoff.
        </p>
        <div className="row">
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Claude model">
            {Object.entries(models).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={busy} onClick={() => write(model)}>
            Research and write the script →
          </button>
          <span className="hint">Uses your Claude plan · about 5–10 minutes</span>
        </div>
      </div>
    );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card scripthead">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <b>
              {words.toLocaleString()} words ≈ {(words / WPM).toFixed(1)} min
            </b>
            <span className="hint">
              {" "}
              · target {v.job.minutes} min · {v.stats.paragraphs} paragraphs · {v.stats.tags} delivery cues · {v.stats.chars.toLocaleString()} characters ≈{" "}
              {v.voice?.total_credits.toLocaleString() ?? v.stats.chars.toLocaleString()} ElevenLabs credits
            </span>
          </div>
          <div className="row">
            {dirty ? (
              <>
                <button type="button" className="btn ghost small" onClick={() => (setDraft(v.script), setDirty(false))}>
                  Discard
                </button>
                <button type="button" className="btn small" onClick={commit} disabled={busy}>
                  Save changes
                </button>
              </>
            ) : v.approved ? (
              <>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => perform(model)}
                  disabled={busy}
                  title="Claude rewrites how it is said (rhythm, emphasis, [delivery cues]) and keeps every fact"
                >
                  ✨ Make it sound human
                </button>
                <button type="button" className="btn secondary small" onClick={() => approve(false)}>
                  ✓ Approved · undo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => perform(model)}
                  disabled={busy}
                  title="Claude rewrites how it is said (rhythm, emphasis, [delivery cues]) and keeps every fact"
                >
                  ✨ Make it sound human
                </button>
                <button type="button" className="btn small" onClick={() => approve(true)} disabled={busy}>
                  I read it · approve the script
                </button>
              </>
            )}
          </div>
        </div>
        {v.warnings.length ? (
          <ul className="warnlist">
            {v.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
        {!v.approved && !dirty ? (
          <p className="hint" style={{ margin: "8px 0 0" }}>
            Read it as your viewer would. Change anything: facts you know better, your own examples, jokes, the ending. Ask Claude in the chat for bigger rewrites.
          </p>
        ) : null}
        <p className="hint" style={{ margin: "8px 0 0" }}>
          Words in [brackets] are how the voice says the next words: [curious], [whispers], [short pause]. Captions leave them out. CAPS stresses a word; “…” adds a beat.
          {v.performs_tags ? "" : " Your channel's voice model ignores them except pauses: choose Eleven v4 on the Channels page to hear them."}
        </p>
      </div>

      {draft.sections.map((s, si) => (
        <div key={s.id} className={"card scriptsec k-" + s.kind}>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="tag accent">{KIND[s.kind]}</span>
            {s.kind === "chapter" ? (
              <input
                className="chaptertitle"
                value={s.title}
                placeholder="Chapter title (shown as a YouTube chapter)"
                onChange={(e) => edit(si, (x) => ({ ...x, title: e.target.value }))}
              />
            ) : null}
          </div>
          {s.paragraphs.map((p, pi) => (
            <div key={p.id} className="para">
              <textarea
                value={p.text}
                rows={Math.max(2, Math.ceil(p.text.length / 95))}
                onChange={(e) =>
                  edit(si, (x) => ({
                    ...x,
                    paragraphs: x.paragraphs.map((y, j) => (j === pi ? { ...y, text: e.target.value } : y)),
                  }))
                }
              />
              <span className="hint mono" title={v.voice?.todo.includes(p.id) ? "Needs a new voice take" : "Voiced"}>
                {p.id}
                {v.voice && !v.voice.todo.includes(p.id) ? " ✓" : ""}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Sources</h3>
          <button type="button" className="btn ghost small" onClick={() => setShowSources((x) => !x)}>
            {showSources ? "Hide" : "Show"}
          </button>
        </div>
        {showSources ? v.sources ? <Markdown text={v.sources} /> : <p className="hint">No sources noted.</p> : null}
      </div>
      <div className="row">
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Claude model" style={{ width: "auto" }}>
          {Object.entries(models).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => confirm("Claude researches and writes the whole script again. Your edits are kept in Undo.") && write(model)}
        >
          Write it again from scratch
        </button>
      </div>
    </div>
  );
};
