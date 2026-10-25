import { useEffect, useState } from "react";
import { ago } from "../api";
import type { FilmSetup, FilmState } from "./filmApi";

/**
 * Claude Code as director: the creator's words become a spec (scene by scene, with seconds) and the film. The spec is
 * theirs to read and change; every Claude change can be undone.
 */
export const MakeTab: React.FC<{
  state: FilmState;
  setup: FilmSetup;
  busy: boolean;
  make: (request: string, model: string) => void;
  saveSpec: (spec: string) => Promise<void>;
  undo: () => void;
}> = ({ state, setup, busy, make, saveSpec, undo }) => {
  const [request, setRequest] = useState(state.job.request ?? "");
  const [model, setModel] = useState("sonnet");
  const [spec, setSpec] = useState(state.spec);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setSpec(state.spec);
  }, [state.spec, editing]);
  const check = state.spec.split(/^## /m).find((s) => /^check before posting/i.test(s));
  return (
    <div>
      <div className="section" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Make it with Claude</h3>
        <p className="hint" style={{ margin: 0 }}>
          Say what the film is for, who watches it, how long, the words and numbers it must show and any colours. Claude writes the spec, builds every
          scene, looks at each one and fixes it. It runs on your Claude plan (no API key), usually in a few minutes.
        </p>
        <textarea
          dir="auto"
          rows={6}
          value={request}
          placeholder="e.g. A 20 s vertical launch film for Nimbo, an invoicing app for Ethiopian freelancers. Show sending an invoice on the phone, a reminder going out and the payment arriving. Blue, clean, confident. End on nimbo.app."
          onChange={(e) => setRequest(e.target.value)}
        />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: "auto" }} aria-label="Model">
            {Object.entries(setup.models).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={busy || !setup.claude || request.trim().length < 8} onClick={() => make(request, model)}>
            {state.film.scenes.length ? "Remake the film" : "Make the film"}
          </button>
        </div>
        {!setup.claude ? <p className="hint">Claude Code is not installed. Install the Claude Code extension or CLI and sign in.</p> : null}
        {state.film.scenes.length ? <span className="hint">Remaking replaces the scenes. For single changes, use the chat; it keeps everything else.</span> : null}
      </div>

      {check ? (
        <div className="section">
          <h3>Check before posting</h3>
          <div className="warnings" style={{ whiteSpace: "pre-wrap" }}>{check.replace(/^check before posting\s*/i, "").trim()}</div>
        </div>
      ) : null}

      <div className="section" style={{ display: "grid", gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>The spec</h3>
          {state.spec || editing ? (
            editing ? (
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn ghost small" onClick={() => (setSpec(state.spec), setEditing(false))}>
                  Cancel
                </button>
                <button type="button" className="btn small" disabled={busy} onClick={() => saveSpec(spec).then(() => setEditing(false))}>
                  Save
                </button>
              </span>
            ) : (
              <button type="button" className="btn secondary small" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </button>
            )
          ) : null}
        </div>
        {editing ? (
          <textarea dir="auto" rows={22} value={spec} onChange={(e) => setSpec(e.target.value)} style={{ fontFamily: "var(--mono)", fontSize: 12 }} />
        ) : state.spec ? (
          <pre className="spec">{state.spec}</pre>
        ) : (
          <p className="hint" style={{ margin: 0 }}>Claude writes the spec when it makes the film: every scene with its seconds, words, motion and sound.</p>
        )}
        {state.spec && !editing ? <span className="hint">After editing the spec, ask Claude in the chat: “rebuild the film from the spec”.</span> : null}
      </div>

      {state.runs.length ? (
        <div className="section" style={{ display: "grid", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Claude's changes</h3>
            <button type="button" className="btn secondary small" disabled={busy || !state.can_undo} onClick={undo}>
              ↶ Undo last
            </button>
          </div>
          {[...state.runs].reverse().map((r, i) => (
            <div key={i} className={"run" + (r.undone ? " undone" : "")}>
              <b>{r.kind === "make" ? "Made the film" : "Chat"}</b> <span className="hint">· {ago(r.finished)} · {r.model}</span>
              <div className="hint">{r.request}</div>
              {r.changes?.length ? <div className="hint">{r.changes.slice(0, 4).join(" · ")}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
