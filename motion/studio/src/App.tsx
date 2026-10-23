import { useCallback, useEffect, useRef, useState } from "react";
import { ACTION, api, clock, type JobSummary } from "./api";
import { JobView } from "./JobView";
import { Upload } from "./steps/Upload";
import { applyTheme, savedTheme, THEMES } from "./theme";

export type Setup = {
  planner_available: boolean;
  strong_noise_available: boolean;
  palette: Record<string, string>;
};

const jobFromUrl = () => new URLSearchParams(location.search).get("job");

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(jobFromUrl());
  const [setup, setSetup] = useState<Setup>({ planner_available: false, strong_noise_available: false, palette: {} });
  const [theme, setTheme] = useState(savedTheme());
  const timer = useRef<number>(undefined);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api<JobSummary[]>("/shorts/jobs");
      setJobs(list);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(loadJobs, list.some((j) => j.state === "running") ? 3000 : 15000);
    } catch {
      timer.current = window.setTimeout(loadJobs, 15000);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    api<Setup>("/shorts/setup").then(setSetup).catch(() => {});
    const back = () => setJobId(jobFromUrl());
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      window.clearTimeout(timer.current);
    };
  }, [loadJobs]);

  // First visit: open the newest video, or the upload screen.
  useEffect(() => {
    if (jobs && jobId === null && !new URLSearchParams(location.search).has("new") && jobs.length)
      open(jobs[0].id, true);
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string | null, replace = false) => {
    setJobId(id);
    const url = id ? "?job=" + id : "?new";
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  };

  const pickTheme = (id: string) => {
    applyTheme(id);
    setTheme(id);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <i />
          Genjustsu <small>/ SHORTS STUDIO</small>
        </div>
        <nav>
          <a href="/cleaner">Audio cleaner</a>
          <a href="/graphics">Motion graphics</a>
          <a href="/">Character workflow</a>
          <a href="/shorts/classic">Classic editor</a>
          <div className="themes" role="radiogroup" aria-label="Editor theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                title={t.name}
                className={theme === t.id ? "on" : ""}
                style={{ background: `linear-gradient(135deg, ${t.tokens.panel} 55%, ${t.tokens.accent} 55%)` }}
                onClick={() => pickTheme(t.id)}
              />
            ))}
          </div>
        </nav>
      </header>
      <div className="body">
        <aside className="side">
          <div className="side-head">
            <button type="button" className="btn" onClick={() => open(null)}>
              ＋ New video
            </button>
            <span className="label">Your videos</span>
          </div>
          <nav className="jobs" aria-label="Your videos">
            {jobs && !jobs.length ? <div className="hint" style={{ padding: 8 }}>No videos yet.</div> : null}
            {(jobs ?? []).map((j) => (
              <JobItem key={j.id} job={j} active={j.id === jobId} onClick={() => open(j.id)} />
            ))}
          </nav>
        </aside>
        <main className="main">
          <div className="page">
            {jobId ? (
              <JobView
                key={jobId}
                id={jobId}
                setup={setup}
                onChange={loadJobs}
                onDeleted={() => {
                  open(null);
                  loadJobs();
                }}
              />
            ) : (
              <Upload
                setup={setup}
                onCreated={(id) => {
                  loadJobs();
                  open(id);
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const JobItem: React.FC<{ job: JobSummary; active: boolean; onClick: () => void }> = ({ job: j, active, onClick }) => {
  const status =
    j.state === "running"
      ? `${ACTION[j.action ?? ""] ?? "Working"}${j.progress != null ? " " + Math.round(j.progress * 100) + "%" : "…"}`
      : j.state === "error"
        ? "Needs attention"
        : j.state === "cancelled"
          ? "Stopped"
          : j.stage;
  const dot = j.state === "running" ? "running" : j.state === "error" ? "error" : j.stage === "Final ready" ? "final" : "";
  return (
    <button type="button" className={"jobitem" + (active ? " active" : "")} onClick={onClick}>
      {j.thumb ? <img src={j.thumb} alt="" /> : <span className="ph" />}
      <span>
        <b>{j.title}</b>
        <small>
          <span className={"dot " + dot} />
          {j.duration ? clock(j.duration) + " · " : ""}
          {status}
        </small>
      </span>
    </button>
  );
};
