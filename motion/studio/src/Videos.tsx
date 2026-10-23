import { useMemo, useState } from "react";
import type { Route } from "./App";
import { ago, clock, STATUS_FILTERS, statusOf, type Client, type JobSummary } from "./api";

const ACTIVE = new Set(["editing", "attention", "new", "review"]);

/** Every video, newest activity first, filtered by client, status and words in the title. */
export const Videos: React.FC<{ jobs: JobSummary[] | null; clients: Client[]; go: (r: Route) => void }> = ({ jobs, clients, go }) => {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState("all");
  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const all = useMemo(() => [...(jobs ?? [])].sort((a, b) => b.updated - a.updated), [jobs]);
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: all.length };
    for (const j of all) {
      const k = statusOf(j).key;
      n[k] = (n[k] ?? 0) + 1;
      if (ACTIVE.has(k)) n.active = (n.active ?? 0) + 1;
    }
    return n;
  }, [all]);
  const shown = all.filter((j) => {
    const k = statusOf(j).key;
    return (
      (client === "all" || (client === "none" ? !j.client || !byId[j.client] : j.client === client)) &&
      (status === "all" || (status === "active" ? ACTIVE.has(k) : k === status)) &&
      (!query.trim() || j.title.toLowerCase().includes(query.trim().toLowerCase()))
    );
  });

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Videos</h1>
          <p className="hint">
            {counts.active ?? 0} in progress · {counts.draft ?? 0} drafts to check · {counts.sent ?? 0} with clients
          </p>
        </div>
        <button type="button" className="btn" onClick={() => go({ page: "new", client: client !== "all" && client !== "none" ? client : null })}>
          ＋ New video
        </button>
      </header>

      <div className="filters">
        <input className="search" placeholder="Search videos…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search videos" />
        <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client" style={{ width: "auto" }}>
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">No client</option>
        </select>
        <div className="seg" role="tablist" aria-label="Status">
          {STATUS_FILTERS.map(([id, name]) => (
            <button key={id} type="button" className={status === id ? "on" : ""} onClick={() => setStatus(id)}>
              {name}
              {counts[id] ? <span className="count">{counts[id]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {jobs === null ? <div className="empty">Loading…</div> : null}
      {jobs && !shown.length ? (
        <div className="empty">
          {all.length ? "No videos match these filters." : "No videos yet. Upload your first recording."}
        </div>
      ) : null}
      <div className="videolist">
        {shown.map((j) => {
          const s = statusOf(j);
          const c = j.client ? byId[j.client] : null;
          return (
            <button key={j.id} type="button" className="vrow" onClick={() => go({ page: "job", id: j.id })}>
              {j.thumb ? <img src={j.thumb} alt="" /> : <span className="ph" />}
              <span className="vtitle">
                <b>{j.title}</b>
                {c ? (
                  <span className="clientchip" style={{ ["--c" as string]: c.color }}>
                    {c.name}
                  </span>
                ) : (
                  <span className="hint">No client</span>
                )}
              </span>
              <span className={"pill s-" + s.key}>{s.label}</span>
              <span className="hint mono">{j.duration ? clock(j.duration) : "–"}</span>
              <span className="hint">{ago(j.updated)}</span>
              <span className="chev">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
