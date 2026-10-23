import { useState } from "react";
import { fileUrl } from "../api";
import type { JobApi } from "../JobView";

const OUTPUTS: [string, string, string, string][] = [
  ["shorts-draft.mp4", "Draft", "Half resolution · about 3× the video length", "draft"],
  ["shorts-final.mp4", "Final", "Full quality, ready to post", "final"],
];

export const Export: React.FC<JobApi> = ({ job, busy, post }) => {
  const ready = OUTPUTS.filter(([f]) => job.files[f]);
  const [shown, setShown] = useState(ready.at(-1)?.[0] ?? null);
  const current = ready.find(([f]) => f === shown)?.[0] ?? ready.at(-1)?.[0];
  const render = (final: boolean) => {
    const d = new FormData();
    d.set("final", String(final));
    post("render", d);
  };
  return (
    <div className="card">
      <h2>Export</h2>
      <p className="lead">Everything renders on this Mac. Render a draft to check timing, then the final.</p>
      <div className="exports">
        {OUTPUTS.map(([file, title, hint, kind]) => (
          <div key={file} className={"export" + (job.files[file] ? " ready" : "")}>
            <h3>{title}</h3>
            <span className="hint">{hint}</span>
            <div className="row">
              <button type="button" className={"btn" + (kind === "draft" ? " secondary" : "")} disabled={busy} onClick={() => render(kind === "final")}>
                {job.files[file] ? `Re-render ${kind}` : `Render ${kind}`}
              </button>
              {job.files[file] ? (
                <a href={fileUrl(job.id, file, job.files[file])} download>
                  Download ↓
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {current ? (
        <>
          <div className="seg" style={{ marginBottom: 10 }}>
            {ready.map(([f, title]) => (
              <button key={f} type="button" className={f === current ? "on" : ""} onClick={() => setShown(f)}>
                {title}
              </button>
            ))}
          </div>
          <div className="phone" style={{ maxWidth: 380 }}>
            <video key={current} src={fileUrl(job.id, current, job.files[current])} controls playsInline preload="metadata" />
          </div>
        </>
      ) : null}
    </div>
  );
};
