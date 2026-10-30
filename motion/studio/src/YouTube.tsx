import { useCallback, useEffect, useRef, useState } from "react";
import type { Route, Setup } from "./App";
import { ago, api, clock, sendJSON, statusOf, type Client, type JobSummary } from "./api";

/** YouTube to Shorts (clipper.py): a link becomes moments, and each moment made becomes a video in Videos. */
export type ClipSummary = {
  id: string;
  title: string;
  channel: string;
  url: string;
  duration: number | null;
  thumb: string | null;
  created: number;
  state: JobSummary["state"];
  status: string;
  progress: number | null;
  action: string | null;
  moments: number;
  made: number;
};
export type Moment = {
  n: number;
  first: number;
  last: number;
  start: number;
  end: number;
  duration: number;
  title: string;
  hook: string;
  kind: string;
  score: number;
  why: string;
  job: string | null;
  short: JobSummary | null;
};
type Settings = { framing: string; track: string; preset: string; edit: boolean; auto: boolean; count: string; length: string; notes: string };
export type ClipJob = ClipSummary & {
  moments: Moment[];
  summary: string;
  warnings: string[];
  settings: Settings;
  chapters: number;
  replayed: boolean;
  transcript: string | null;
  parts: number;
  transcript_needed: { minutes: number } | null;
  source: string | null;
  planner_available: boolean;
};

const KIND: Record<string, string> = {
  viral: "🔥 Viral",
  informative: "💡 Informative",
  key: "🔑 Key moment",
  story: "📖 Story",
  funny: "😂 Funny",
  emotional: "❤️ Emotional",
  controversial: "⚡ Debate",
};
const SOURCE: Record<string, string> = {
  "youtube-captions": "the video's own captions",
  "youtube-auto": "YouTube's automatic captions",
  elevenlabs: "ElevenLabs Scribe",
  whisper: "whisper.cpp on this Mac",
};
const LENGTH_OPTIONS: [string, string][] = [
  ["auto", "Whatever each moment needs (20–75 s)"],
  ["short", "Short · 15–30 s"],
  ["medium", "Medium · 30–60 s"],
  ["long", "Long · 60–90 s"],
];

const clipClock = (t: number | null | undefined) =>
  t == null ? "–" : t >= 3600 ? `${Math.floor(t / 3600)}:${clock(t % 3600).padStart(5, "0")}` : clock(t);

const Activity: React.FC<{ job: ClipSummary; onCancel?: () => void }> = ({ job, onCancel }) => (
  <div className="activity">
    <div className="spinner" />
    <div>
      <b>{job.status || "Working…"}</b>
      <p>You can leave this page. Each short shows up in Videos as soon as it is cut.</p>
      <div className={"bar" + (job.progress == null ? " indeterminate" : "")}>
        <i style={job.progress == null ? undefined : { width: `${Math.round(job.progress * 100)}%` }} />
      </div>
    </div>
    {onCancel ? (
      <button type="button" className="btn secondary small" onClick={onCancel}>
        Cancel
      </button>
    ) : null}
  </div>
);

/** Paste a link (with the few choices that matter), and every YouTube video turned into shorts so far. */
export const YouTubeList: React.FC<{ setup: Setup; clients: Client[]; go: (r: Route) => void }> = ({ setup, clients, go }) => {
  const [jobs, setJobs] = useState<ClipSummary[] | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [auto, setAuto] = useState(true);
  const [edit, setEdit] = useState(true);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<number>(undefined);

  const load = useCallback(async () => {
    try {
      const list = await api<ClipSummary[]>("/clips/jobs");
      setJobs(list);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, list.some((j) => j.state === "running") ? 3000 : 15000);
    } catch {
      timer.current = window.setTimeout(load, 15000);
    }
  }, []);
  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(form.current!);
    data.set("auto", String(auto));
    data.set("edit", String(edit && setup.planner_available));
    setSending(true);
    setError("");
    try {
      const j = await api<ClipJob>("/clips/jobs", { method: "POST", body: data });
      go({ page: "clips", id: j.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="card">
        <h2 style={{ fontSize: 24 }}>YouTube to Shorts</h2>
        <p className="lead">
          Paste a link. Claude reads the whole video and finds the moments that hook, teach or matter most, crops each
          one to 9:16 around the speaker and edits it as a short: captions, hook, graphics and sound. You review the drafts.
        </p>
        <form ref={form} onSubmit={submit}>
          <div className="ytlink">
            <input name="url" type="url" required placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube link" autoFocus />
            <button className="btn" disabled={sending}>
              {sending ? "Starting…" : auto ? "Make shorts →" : "Find moments →"}
            </button>
          </div>
          {!setup.planner_available ? (
            <div className="notice err" style={{ marginTop: 12 }}>
              Finding moments uses Claude: add ANTHROPIC_API_KEY to .env, or download here and ask Claude Code to pick the
              moments (python clipper.py find JOB).
            </div>
          ) : null}

          <div className="grid" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Spoken language</span>
              <select name="language" defaultValue="am">
                <option value="am">Amharic (with English words)</option>
                <option value="en">English only</option>
                <option value="auto">Detect automatically</option>
              </select>
            </label>
            <label className="field">
              <span>How many shorts</span>
              <select name="count" defaultValue="auto">
                <option value="auto">Every strong moment</option>
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    The best {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Length</span>
              <select name="length" defaultValue="auto">
                {LENGTH_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" title="Follow: a 9:16 crop that stays on the speaker. Whole picture: the full frame over a blurred fill (slides, screens, wide shots).">
              <span>Framing</span>
              <select name="framing" defaultValue="auto">
                <option value="auto">Auto · follow the speaker, whole picture without one</option>
                <option value="follow">Always follow the speaker</option>
                <option value="fit">Whole picture, blurred fill</option>
              </select>
            </label>
            <label className="field" title="Fast: face and hands, about 1× each short's length. Full adds your cutout for studio looks, about 5×.">
              <span>Tracking</span>
              <select name="track_mode" defaultValue="fast">
                <option value="fast">Fast · keep the original background</option>
                <option value="full">Full · studio looks (slower)</option>
                <option value="off">Off · screen recordings</option>
              </select>
            </label>
            <label className="field">
              <span>Caption style</span>
              <select name="preset" defaultValue="duo">
                <option value="duo">Two-line glass (default)</option>
                <option value="auto">Let Claude choose</option>
                <option value="karaoke">Karaoke · words as spoken</option>
                <option value="sweep">Light sweep</option>
                <option value="pill">Pill · colour chip</option>
                <option value="bold">Bold · big words</option>
                <option value="editorial">Editorial · serif accent words</option>
                <option value="none">No captions</option>
              </select>
            </label>
            <label className="field">
              <span>Client</span>
              <select name="client" defaultValue="">
                <option value="">No client (my own video)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ai" style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <label className="check" style={{ fontSize: 14, color: "var(--text)", fontWeight: 650 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Make the shorts right away
            </label>
            <span className="hint">
              {auto ? "Every moment Claude finds becomes a short, strongest first." : "Claude lists the moments first; you choose which ones to make."}
            </span>
            <label className="check" style={{ fontSize: 14, color: "var(--text)", fontWeight: 650, opacity: setup.planner_available ? 1 : 0.6 }}>
              <input type="checkbox" checked={edit && setup.planner_available} disabled={!setup.planner_available} onChange={(e) => setEdit(e.target.checked)} />
              ✨ Edit each one for me
            </label>
            <span className="hint">
              Claude tightens each short, adds the hook, picks the look and graphics, then renders a draft. Two Claude calls per
              short, made one after another so your Mac stays responsive.
            </span>
            <textarea name="notes" rows={2} placeholder="Optional: what to look for, e.g. “only the money tips”, “skip the intro story”, “keep it under 40 seconds”." />
          </div>

          {error ? <div className="notice err" style={{ marginTop: 16 }}>{error}</div> : null}
          <div className="footer">
            <span className="hint">
              Use videos you own or have permission to reuse. The video downloads to this Mac (up to 1080p). Claude reads its
              transcript as text; ElevenLabs is used only if a video has no captions, and only after you say so.
            </span>
          </div>
        </form>
      </div>

      <h3 style={{ margin: "26px 0 10px" }}>Your YouTube videos</h3>
      {jobs === null ? <div className="empty">Loading…</div> : null}
      {jobs && !jobs.length ? <div className="empty">Nothing yet. Paste a link above.</div> : null}
      <div className="videolist">
        {(jobs ?? []).map((j) => (
          <button key={j.id} type="button" className="vrow ytrow" onClick={() => go({ page: "clips", id: j.id })}>
            {j.thumb ? <img src={j.thumb} alt="" /> : <span className="ph" />}
            <span className="vtitle">
              <b>{j.title}</b>
              <span className="hint">{j.channel}</span>
            </span>
            <span className={"pill " + (j.state === "running" ? "s-editing" : j.state === "error" ? "s-attention" : j.made ? "s-draft" : "")}>
              {j.state === "running"
                ? j.progress != null
                  ? `Working ${Math.round(j.progress * 100)}%`
                  : "Working…"
                : j.state === "error"
                  ? "Needs attention"
                  : j.moments
                    ? `${j.made} of ${j.moments} made`
                    : "No moments yet"}
            </span>
            <span className="hint mono">{clipClock(j.duration)}</span>
            <span className="hint">{ago(j.created)}</span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** One YouTube video: progress, then its moments (strongest first) with a preview each, and the shorts made from them. */
export const ClipView: React.FC<{ id: string; go: (r: Route) => void; onChange: () => void }> = ({ id, go, onChange }) => {
  const [job, setJob] = useState<ClipJob | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [again, setAgain] = useState(false);
  const timer = useRef<number>(undefined);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const j = await api<ClipJob>(`/clips/jobs/${id}`);
      setJob(j);
      const running = j.state === "running" || j.moments.some((m) => m.short?.state === "running");
      if (wasRunning.current && !running) onChange();
      wasRunning.current = running;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, running ? 2500 : 20000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, onChange]);
  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);

  const act = async (path: string, init?: RequestInit) => {
    setError("");
    try {
      setJob(await api<ClipJob>(`/clips/jobs/${id}/${path}`, { method: "POST", ...init }));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 1500);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const make = async (numbers: number[]) => {
    setError("");
    try {
      setJob(await sendJSON<ClipJob>(`/clips/jobs/${id}/make`, "POST", { moments: numbers }));
      setPicked(new Set());
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 1500);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this download and its moments? The shorts already made stay in Videos.")) return;
    await api(`/clips/jobs/${id}`, { method: "DELETE" });
    go({ page: "youtube" });
  };

  if (!job) return <div className="page">{error ? <div className="notice err">{error}</div> : <div className="empty">Loading…</div>}</div>;
  const running = job.state === "running";
  const unmade = job.moments.filter((m) => !m.short);
  const waiting = job.moments.some((m) => m.short && m.short.state === "idle" && m.short.stage === "New");

  return (
    <div className="page">
      <header className="pagehead">
        <div style={{ minWidth: 0 }}>
          <button type="button" className="btn ghost small" onClick={() => go({ page: "youtube" })} style={{ marginBottom: 10 }}>
            ‹ YouTube videos
          </button>
          <h1 style={{ overflowWrap: "anywhere" }}>{job.title}</h1>
          <p className="hint">
            {job.channel ? job.channel + " · " : ""}
            {clipClock(job.duration)}
            {job.parts ? ` · transcript from ${SOURCE[job.transcript ?? ""] ?? job.transcript}` : ""}
            {job.replayed ? " · uses YouTube's most-replayed graph" : ""}
            {job.chapters ? ` · ${job.chapters} chapters` : ""} ·{" "}
            <a href={job.url} target="_blank" rel="noreferrer">
              open on YouTube ↗
            </a>
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={remove} disabled={running}>
          Delete
        </button>
      </header>

      {running ? <Activity job={job} onCancel={() => act("cancel")} /> : null}
      {error ? <div className="notice err">{error}</div> : null}
      {!running && job.state === "error" ? (
        <div className="notice err">
          <span>{job.status}</span>
          <button type="button" className="btn small" style={{ marginLeft: "auto", fontSize: 12.5 }} onClick={() => act("continue")}>
            Try again
          </button>
        </div>
      ) : null}
      {!running && job.state === "cancelled" ? (
        <div className="notice">
          <span>Stopped. Shorts already made stay in Videos.</span>
          <button type="button" className="btn small" style={{ marginLeft: "auto", fontSize: 12.5 }} onClick={() => act("continue")}>
            Continue
          </button>
        </div>
      ) : null}
      {!running && job.transcript_needed && !job.parts ? (
        <div className="card">
          <b>This video has no captions on YouTube</b>
          <p className="hint" style={{ margin: "6px 0 14px" }}>
            To find its moments, its {Math.round(job.transcript_needed.minutes)} minutes need a transcript. ElevenLabs Scribe
            (cloud, paid per minute, from your ElevenLabs credit) handles Amharic. The words are reused for every short, so
            they are paid for only once.
          </p>
          <button type="button" className="btn" onClick={() => act("transcribe")}>
            Transcribe {Math.round(job.transcript_needed.minutes)} min with ElevenLabs
          </button>
        </div>
      ) : null}
      {!running && job.state === "done" && job.status && !job.moments.length && !job.transcript_needed ? <div className="notice">{job.status}</div> : null}
      {!running && waiting && job.state !== "error" ? (
        <div className="notice">
          <span>Some shorts are cut but were not edited yet (the app was closed or the step stopped).</span>
          <button type="button" className="btn small" style={{ marginLeft: "auto", fontSize: 12.5 }} onClick={() => make(job.moments.filter((m) => m.short).map((m) => m.n))}>
            Edit them now
          </button>
        </div>
      ) : null}

      {job.moments.length ? (
        <>
          <div className="ythead">
            <div>
              <h3 style={{ margin: 0 }}>
                {job.moments.length} moment{job.moments.length === 1 ? "" : "s"} · {job.moments.length - unmade.length} made
              </h3>
              {job.summary ? <p className="hint" style={{ margin: "4px 0 0" }}>{job.summary}</p> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {job.planner_available ? (
                <button type="button" className="btn secondary small" disabled={running} onClick={() => setAgain(!again)}>
                  Find again…
                </button>
              ) : null}
              {unmade.length ? (
                <button
                  type="button"
                  className="btn small"
                  disabled={running}
                  onClick={() => make(picked.size ? [...picked] : unmade.map((m) => m.n))}
                >
                  {picked.size ? `Make ${picked.size} chosen` : `Make all ${unmade.length}`} →
                </button>
              ) : null}
            </div>
          </div>
          {again ? (
            <form
              className="card ytagain"
              onSubmit={(e) => {
                e.preventDefault();
                setAgain(false);
                act("find", { body: new FormData(e.currentTarget) });
              }}
            >
              <div className="grid">
                <label className="field">
                  <span>How many</span>
                  <select name="count" defaultValue={job.settings.count}>
                    <option value="auto">Every strong moment</option>
                    {[3, 5, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        The best {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Length</span>
                  <select name="length" defaultValue={job.settings.length}>
                    {LENGTH_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea name="notes" rows={2} defaultValue={job.settings.notes} placeholder="What should Claude look for this time?" style={{ marginTop: 10 }} />
              <div className="footer">
                <span className="hint">One Claude call. Shorts already made stay.</span>
                <button className="btn small">Find moments</button>
              </div>
            </form>
          ) : null}
          {job.warnings.length ? (
            <details className="hint" style={{ margin: "0 0 12px" }}>
              <summary>{job.warnings.length} notes from the moment check</summary>
              <ul>
                {job.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="moments">
            {job.moments.map((m) => {
              const s = m.short ? statusOf(m.short) : null;
              return (
                <article key={m.n} className={"moment" + (picked.has(m.n) ? " on" : "")}>
                  {job.source ? (
                    <video src={`${job.source}#t=${m.start},${m.end}`} preload="metadata" controls playsInline />
                  ) : (
                    <div className="ph" />
                  )}
                  <div className="mbody">
                    <div className="mtop">
                      <span className="mscore" title="How likely this holds a stranger who is scrolling (Claude's estimate)">
                        {m.score}
                      </span>
                      <span className="pill">{KIND[m.kind] ?? m.kind}</span>
                      <span className="hint mono">
                        {clipClock(m.start)}–{clipClock(m.end)} · {Math.round(m.duration)}s
                      </span>
                    </div>
                    <b className="mtitle">{m.title}</b>
                    {m.hook ? <div className="mhook">“{m.hook}”</div> : null}
                    <p className="hint" style={{ margin: 0 }}>{m.why}</p>
                    <div className="mfoot">
                      {m.short && s ? (
                        <>
                          <span className={"pill s-" + s.key}>{m.short.state === "idle" && m.short.stage === "New" ? "Waiting" : s.label}</span>
                          <button type="button" className="btn secondary small" onClick={() => go({ page: "job", id: m.short!.id })}>
                            Open short ›
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={picked.has(m.n)}
                              onChange={(e) => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(m.n);
                                else next.delete(m.n);
                                setPicked(next);
                              }}
                            />
                            Choose
                          </label>
                          <button type="button" className="btn small" disabled={running} onClick={() => make([m.n])}>
                            Make this short
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};
