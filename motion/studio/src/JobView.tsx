import { useCallback, useEffect, useRef, useState } from "react";
import type { Setup } from "./App";
import { ACTION, ago, api, clock, FAIL, friendly, jobUrl, sendJSON, type Job } from "./api";
import { CaptionsTab } from "./steps/CaptionsTab";
import { Cut } from "./steps/Cut";
import { Export } from "./steps/Export";
import { Graphics } from "./steps/Graphics";
import { Look } from "./steps/Look";
import { Review } from "./steps/Review";

export type Tab = "review" | "cut" | "look" | "captions" | "graphics" | "export";

/** What every step gets: the job, and helpers that update it. */
export type JobApi = {
  job: Job;
  setup: Setup;
  busy: boolean;
  show: (j: Job) => void;
  post: (path: string, data?: FormData) => Promise<void>;
  savePlan: (plan: Job["plan"]) => Promise<void>;
  toast: (msg: string, error?: boolean) => void;
  goto: (t: Tab) => void;
};

const TABS: [Tab, string, string][] = [
  ["review", "Review", "What Claude made"],
  ["cut", "Cut", "What's kept"],
  ["look", "Look", "Background & light"],
  ["captions", "Captions", "Font, colour, motion"],
  ["graphics", "Graphics", "Captions & effects"],
  ["export", "Export", "Draft & final"],
];

export const JobView: React.FC<{
  id: string;
  setup: Setup;
  onChange: () => void;
  onDeleted: () => void;
}> = ({ id, setup, onChange, onDeleted }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "review");
  const [notice, setNotice] = useState<{ msg: string; error: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const poll = useRef<number>(undefined);
  const seenFinish = useRef<number | undefined>(undefined);
  const wasRunning = useRef(false);

  const show = useCallback(
    (j: Job) => {
      setJob(j);
      const running = j.state === "running";
      if (wasRunning.current !== running) onChange();
      wasRunning.current = running;
      if (j.state === "done" && j.finished && Date.now() / 1000 - j.finished < 600 && seenFinish.current !== j.finished) {
        if (seenFinish.current !== undefined) setNotice({ msg: j.status, error: false });
        seenFinish.current = j.finished;
      }
    },
    [onChange],
  );

  const refresh = useCallback(async () => {
    window.clearTimeout(poll.current);
    try {
      const j = await api(jobUrl(id));
      show(j);
      if (j.state === "running") poll.current = window.setTimeout(refresh, 1500);
    } catch (e) {
      if (/not found/i.test((e as Error).message)) onDeleted();
      else setNotice({ msg: (e as Error).message, error: true });
    }
  }, [id, show, onDeleted]);

  useEffect(() => {
    seenFinish.current = undefined;
    refresh();
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(poll.current);
      window.clearInterval(t);
    };
  }, [refresh]);

  if (!job) return <div className="empty">Loading…</div>;
  const busy = job.state === "running";

  const toast = (msg: string, error = false) => setNotice({ msg, error });
  const post = async (path: string, data?: FormData) => {
    try {
      setNotice(null);
      show(await api(jobUrl(id, path), { method: "POST", body: data }));
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const savePlan = async (plan: Job["plan"]) => {
    try {
      show(await sendJSON(jobUrl(id, "plan"), "PUT", plan));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const ctx: JobApi = { job, setup, busy, show, post, savePlan, toast, goto: setTab };

  const built = !!job.tracking;
  const open: Record<Tab, boolean> = { review: true, cut: !!job.cut, look: built, captions: built, graphics: built, export: built };
  const done: Record<Tab, boolean> = {
    review: !!job.files["shorts-draft.mp4"],
    cut: built,
    look: !!job.plan?.background && job.plan.background.mode !== "original",
    captions: job.plan?.captions_auto === false,
    graphics: !!job.plan?.events.length,
    export: !!job.files["shorts-final.mp4"],
  };
  const current = open[tab] ? tab : "review";

  const rename = async (title: string) => {
    if (!title.trim() || title === job.title) return;
    try {
      show(await sendJSON(jobUrl(id), "PATCH", { title }));
      onChange();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete “${job.title}” and all its files? This can’t be undone.`)) return;
    try {
      await api(jobUrl(id), { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const retry = () => {
    const a = job.action;
    if (a === "transcribe") post("transcribe");
    else if (a === "apply") post("cut/apply");
    else if (a === "render") {
      const d = new FormData();
      d.set("final", String(!!job.final));
      post("render", d);
    } else setTab(a === "plan" ? "graphics" : a === "autocut" ? "cut" : "review");
  };

  const elapsed = now / 1000 - (job.started ?? now / 1000);
  const p = job.progress;
  const stopped = job.state === "cancelled";

  return (
    <>
      <div className="jobhead">
        <input
          className="title-input"
          aria-label="Video title"
          maxLength={80}
          defaultValue={job.title}
          key={job.title}
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button type="button" className="btn ghost small" disabled={busy} onClick={remove}>
          Delete
        </button>
        <div className="meta">
          Uploaded {ago(job.created)}
          {job.cut_summary ? " · original " + clock(job.cut_summary.original) : ""}
          {job.manifest ? " · edit " + clock(job.manifest.duration) : ""}
        </div>
      </div>

      <div className="stepper" role="tablist">
        {TABS.map(([k, label, hint], i) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={current === k}
            title={hint}
            disabled={!open[k]}
            className={[done[k] ? "done" : "", current === k ? "viewing" : ""].join(" ")}
            onClick={() => setTab(k)}
          >
            <span className="n">{done[k] ? "✓" : i + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="activity">
          <div className="spinner" />
          <div>
            <b>{ACTION[job.action ?? ""] ?? "Working"}</b>
            <p>{job.status}</p>
            <div className={"bar" + (p == null ? " indeterminate" : "")}>
              <i style={{ width: p == null ? undefined : `${Math.max(2, p * 100)}%` }} />
            </div>
            <small>
              {clock(elapsed)} elapsed
              {p != null && p > 0.04 && p < 1 ? ` · about ${clock((elapsed * (1 - p)) / p)} left for this step` : ""}
              {job.action === "auto" ? " · you can leave this page and come back" : ""}
            </small>
          </div>
          <button
            type="button"
            className="btn secondary small"
            disabled={job.stopping}
            onClick={async () => {
              try {
                show(await api(jobUrl(id, "cancel"), { method: "POST" }));
              } catch (e) {
                toast((e as Error).message, true);
                refresh();
              }
            }}
          >
            {job.stopping ? "Stopping…" : "Cancel"}
          </button>
        </div>
      ) : null}

      {job.state === "error" || stopped ? (
        <div className="problem">
          <b>{stopped ? `${ACTION[job.action ?? ""] ?? "This step"} was stopped` : FAIL[job.action ?? ""] ?? "Something went wrong"}</b>
          <p>{stopped ? "Nothing else was changed. Start it again whenever you like." : friendly(job.status)}</p>
          <div className="row">
            <button type="button" className="btn small" onClick={retry}>
              {stopped ? "Start again" : "Try again"}
            </button>
            <details>
              <summary>Technical details</summary>
              <pre>{job.status}</pre>
            </details>
          </div>
        </div>
      ) : null}

      {notice && !busy ? (
        <div className={"notice" + (notice.error ? " err" : "")}>
          {notice.error ? "!" : "✓"} {notice.msg}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      ) : null}

      {current === "review" ? <Review {...ctx} /> : null}
      {current === "cut" ? <Cut {...ctx} /> : null}
      {current === "look" ? <Look {...ctx} /> : null}
      {current === "captions" ? <CaptionsTab {...ctx} /> : null}
      {current === "graphics" ? <Graphics {...ctx} /> : null}
      {current === "export" ? <Export {...ctx} /> : null}
    </>
  );
};
