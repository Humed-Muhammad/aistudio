import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { Setup } from "./App";
import { ACTION, ago, api, clock, FAIL, fileUrl, friendly, jobUrl, sendJSON, statusOf, type Client, type Job, type Plan } from "./api";
import { CutPreview } from "./CutPreview";
import { Preview } from "./Preview";
import { CaptionsTab } from "./steps/CaptionsTab";
import { Cut } from "./steps/Cut";
import { Export } from "./steps/Export";
import { Graphics } from "./steps/Graphics";
import { Look } from "./steps/Look";
import { Review } from "./steps/Review";
import { SoundTab } from "./steps/SoundTab";

export type Tab = "review" | "cut" | "look" | "captions" | "graphics" | "sound" | "export";

/** What every section gets: the job, helpers that update it, and the shared preview in the middle. */
export type JobApi = {
  job: Job;
  setup: Setup;
  /** Something is running: no new steps (build, render, Ask Claude). */
  busy: boolean;
  /** Editing is blocked too. A render or post text works from a snapshot, so editing stays open during those. */
  locked: boolean;
  show: (j: Job) => void;
  post: (path: string, data?: FormData) => Promise<void>;
  savePlan: (plan: Job["plan"]) => Promise<void>;
  toast: (msg: string, error?: boolean) => void;
  goto: (t: Tab) => void;
  /** set: unsaved changes the live preview shows on top of the saved plan; player: seek and play it. */
  preview: { set: (o: Partial<Plan> | undefined) => void; player: React.RefObject<PlayerRef | null> };
};

const SECTIONS: [Tab, string, string][] = [
  ["review", "◎", "Overview"],
  ["cut", "✂", "Cut"],
  ["look", "◐", "Look"],
  ["captions", "Aa", "Captions"],
  ["graphics", "◆", "Graphics"],
  ["sound", "♪", "Sound"],
  ["export", "⇪", "Deliver"],
];
type View = "live" | "draft" | "final" | "cut" | "trim";

export const JobView: React.FC<{
  id: string;
  setup: Setup;
  clients: Client[];
  onChange: () => void;
  onBack: () => void;
  onDeleted: () => void;
}> = ({ id, setup, clients, onChange, onBack, onDeleted }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "review");
  const [view, setView] = useState<View | null>(null);
  const [override, setOverride] = useState<Partial<Plan> | undefined>(undefined);
  const [notice, setNotice] = useState<{ msg: string; error: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const player = useRef<PlayerRef>(null);
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

  if (!job) return <div className="empty" style={{ margin: 24 }}>Loading…</div>;
  const busy = job.state === "running";
  const locked = busy && !["render", "post"].includes(job.action ?? "");
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
  const goto = (t: Tab) => {
    setTab(t);
    setView(null);
  };
  const ctx: JobApi = { job, setup, busy, locked, show, post, savePlan, toast, goto, preview: { set: setOverride, player } };
  // Look, captions, graphics and sound only change the plan: they stay editable while a render runs.
  const editCtx: JobApi = { ...ctx, busy: locked };

  const built = !!job.tracking;
  const open: Record<Tab, boolean> = { review: true, cut: !!job.cut, look: built, captions: built, graphics: built, sound: !!job.cut, export: built };
  const current = open[tab] ? tab : "review";
  const draftFile = job.files["shorts-draft.mp4"];
  const finalFile = job.files["shorts-final.mp4"];
  const changedSinceDraft =
    !!draftFile && Math.max(job.files["plan.json"] ?? 0, job.files["source.mp4"] ?? 0, job.files["captions.json"] ?? 0) > draftFile;
  const cutChanged = !!job.files["source.mp4"] && (job.cut_mtime ?? 0) > job.files["source.mp4"];
  const client = clients.find((c) => c.id === job.client) ?? null;
  const s = statusOf(job);
  // The overview opens on the rendered file; the Cut section plays the current cut; other sections show the live edit.
  const ranges = job.cut_summary?.ranges;
  const shownView: View =
    view ??
    (current === "cut" && ranges
      ? "trim"
      : !built
        ? "cut"
        : current === "review" && finalFile
          ? "final"
          : current === "review" && draftFile && !changedSinceDraft
            ? "draft"
            : "live");

  const render = (final: boolean) => {
    const d = new FormData();
    d.set("final", String(final));
    post("render", d);
  };
  const patch = async (body: object, msg?: string) => {
    try {
      show(await sendJSON(jobUrl(id), "PATCH", body));
      onChange();
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const rename = (title: string) => title.trim() && title !== job.title && patch({ title });
  const remove = async () => {
    if (!confirm(`Delete “${job.title}” and all its files? This can’t be undone.`)) return;
    try {
      await api(jobUrl(id), { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const saveKit = async () => {
    if (!client) return;
    if (client.kit && !confirm(`Replace ${client.name}'s brand kit with this video's style?`)) return;
    try {
      await sendJSON(`/shorts/clients/${client.id}/kit`, "PUT", { job: id });
      onChange();
      toast(`Saved as ${client.name}'s brand kit. Their new videos start with this style.`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const useKit = () => post("kit").then(() => toast(`${client?.name}'s brand kit applied. Render a new draft to see it in the file.`));
  const retry = () => {
    const a = job.action;
    if (a === "transcribe") post("transcribe");
    else if (a === "apply") post("cut/apply");
    else if (a === "render" || (a === "auto" && job.status.startsWith("Render failed"))) render(a === "render" && !!job.final);
    else goto(a === "plan" ? "graphics" : a === "autocut" || a === "fix" ? "cut" : a === "post" ? "export" : "review");
  };

  // The one next step, always in the same place.
  const next = busy
    ? null
    : !built
      ? null
      : cutChanged
        ? { label: "Rebuild edit", run: () => goto("cut") }
        : !draftFile || changedSinceDraft
          ? { label: draftFile ? "Render new draft" : "Render draft", run: () => render(false) }
          : !finalFile || (job.files["plan.json"] ?? 0) > finalFile
            ? { label: "Render final", run: () => render(true) }
            : { label: "Deliver", run: () => goto("export") };

  const elapsed = now / 1000 - (job.started ?? now / 1000);
  const p = job.progress;
  const stopped = job.state === "cancelled";

  return (
    <div className="editor">
      <header className="edbar">
        <button type="button" className="iconbtn" onClick={onBack} title="All videos" aria-label="All videos">
          ←
        </button>
        <div className="edtitle">
          <input
            className="title-input"
            aria-label="Video title"
            maxLength={80}
            defaultValue={job.title}
            key={job.title}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <div className="edmeta">
            <select
              className="clientselect"
              value={job.client ?? ""}
              style={{ ["--c" as string]: client?.color ?? "var(--muted)" }}
              onChange={(e) => patch({ client: e.target.value || null }, e.target.value ? "Client set." : undefined)}
              aria-label="Client"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className={"pill s-" + s.key}>{s.label}</span>
            <span className="hint">
              {job.cut_summary ? clock(job.cut_summary.original) + " → " : ""}
              {job.manifest ? clock(job.manifest.duration) : ""} · {ago(job.created)}
            </span>
          </div>
        </div>
        <div className="edactions">
          {next ? (
            <button type="button" className="btn" onClick={next.run}>
              {next.label}
            </button>
          ) : null}
          {finalFile ? (
            <a className="btn secondary" href={fileUrl(id, "shorts-final.mp4", finalFile)} download={`${job.title}.mp4`}>
              Download ↓
            </a>
          ) : null}
          <details className="menu">
            <summary className="iconbtn" aria-label="More">⋯</summary>
            <div className="menupop">
              <button type="button" disabled={!client || !job.plan} onClick={saveKit}>
                Save style as brand kit{client ? ` for ${client.name}` : ""}
              </button>
              <button type="button" disabled={!client?.kit || !job.plan || busy} onClick={useKit}>
                Apply {client ? `${client.name}'s` : "client"} brand kit
              </button>
              {draftFile ? (
                <a href={fileUrl(id, "shorts-draft.mp4", draftFile)} download={`${job.title} (draft).mp4`}>
                  Download draft
                </a>
              ) : null}
              <button type="button" className="danger" disabled={busy} onClick={remove}>
                Delete video
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className={"edbody" + (current === "cut" ? " widepanel" : "")}>
        <nav className="sections" aria-label="Editor sections">
          {SECTIONS.map(([k, icon, label]) => (
            <button
              key={k}
              type="button"
              className={current === k ? "on" : ""}
              disabled={!open[k]}
              onClick={() => goto(k)}
              title={open[k] ? label : "Available once your edit is built"}
            >
              <span className="ico">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="center">
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
                  {p != null && p > 0.04 && p < 1 ? ` · about ${clock((elapsed * (1 - p)) / p)} left` : ""}
                  {job.action === "auto" ? " · you can leave and come back" : ""}
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

          {built || ranges ? (
            <div className="seg viewer-tabs">
              {ranges ? (
                <button type="button" className={shownView === "trim" ? "on" : ""} onClick={() => setView("trim")}>
                  Cut preview
                </button>
              ) : null}
              {built ? (
                <>
                  <button type="button" className={shownView === "live" ? "on" : ""} onClick={() => setView("live")}>
                    Live edit
                  </button>
                  <button type="button" className={shownView === "draft" ? "on" : ""} disabled={!draftFile} onClick={() => setView("draft")}>
                    Draft{draftFile && changedSinceDraft ? " (older)" : ""}
                  </button>
                  <button type="button" className={shownView === "final" ? "on" : ""} disabled={!finalFile} onClick={() => setView("final")}>
                    Final
                  </button>
                  <button type="button" className={shownView === "cut" ? "on" : ""} onClick={() => setView("cut")}>
                    Plain cut
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="viewer">
            {shownView === "trim" && ranges ? (
              <div className="frame">
                <CutPreview src={fileUrl(id, "upload.mp4")} ranges={ranges} duration={job.cut_summary!.original} />
              </div>
            ) : shownView === "live" && built ? (
              <Preview ref={player} id={id} version={JSON.stringify(job.plan) + job.files["source.mp4"] + "/" + job.files["captions.json"]} override={override} />
            ) : (
              <div className="frame">
                {job.cut || built ? (
                  <video
                    key={shownView}
                    src={
                      shownView === "draft"
                        ? fileUrl(id, "shorts-draft.mp4", draftFile)
                        : shownView === "final"
                          ? fileUrl(id, "shorts-final.mp4", finalFile)
                          : built
                            ? fileUrl(id, "source.mp4", job.files["source.mp4"])
                            : fileUrl(id, "upload.mp4")
                    }
                    controls
                    playsInline
                  />
                ) : (
                  <div className="framewait">
                    <div className="spinner" />
                    <span>Preparing your video…</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="hint viewer-hint">
            {shownView === "trim"
              ? cutChanged
                ? "Your cut as you have it now, skipping what you unticked. Rebuild to put it in your edit."
                : "Your cut, skipping the parts you unticked. Nothing is deleted: tick a part again to bring it back."
              : shownView === "live"
                ? "The edit plays live, exactly as it will render. Space to play."
                : shownView === "draft"
                  ? "Half-resolution draft render."
                  : shownView === "final"
                    ? "Full-quality final."
                    : built
                      ? "Your cut with your original voice, no graphics."
                      : "Your recording as uploaded."}
          </span>
        </section>

        <aside className="panel">
          {current === "review" ? <Review {...ctx} /> : null}
          {current === "cut" ? <Cut {...ctx} /> : null}
          {current === "look" ? <Look {...editCtx} /> : null}
          {current === "captions" ? <CaptionsTab {...editCtx} /> : null}
          {current === "graphics" ? <Graphics {...editCtx} /> : null}
          {current === "sound" ? <SoundTab {...editCtx} /> : null}
          {current === "export" ? <Export {...ctx} /> : null}
        </aside>
      </div>
    </div>
  );
};
