import { useEffect, useState } from "react";
import type { Route } from "./App";
import { api, ago, sendJSON, statusOf, type Client, type JobSummary } from "./api";

const COLORS = ["#6EC1FF", "#5EEAD4", "#FF7A59", "#FF6FAE", "#B79CFF", "#B8F35A", "#F5A524", "#94A3B8"];
const KIT_NAMES: Record<string, string> = {
  look: "Look",
  captions: "Captions",
  graphics: "Graphic style",
  effect: "Switch effect",
};

/** The people you edit for: each with a colour, notes Claude reads on every step, and a brand kit. */
export const Clients: React.FC<{
  clients: Client[];
  jobs: JobSummary[];
  selected: string | null;
  reload: () => Promise<unknown>;
  go: (r: Route) => void;
}> = ({ clients, jobs, selected, reload, go }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const current = clients.find((c) => c.id === selected) ?? null;

  const add = async () => {
    try {
      const c = await sendJSON<Client>("/shorts/clients", "POST", { name });
      setName("");
      setAdding(false);
      await reload();
      go({ page: "clients", client: c.id });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Clients</h1>
          <p className="hint">Each client keeps a brand kit: their look, captions and style start every new video of theirs.</p>
        </div>
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          ＋ New client
        </button>
      </header>

      {adding ? (
        <div className="card row" style={{ marginBottom: 14 }}>
          <input autoFocus placeholder="Client or channel name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={!name.trim()} onClick={add}>
            Add client
          </button>
          <button type="button" className="btn secondary" onClick={() => setAdding(false)}>
            Cancel
          </button>
          {error ? <span className="hint" style={{ color: "var(--danger)" }}>{error}</span> : null}
        </div>
      ) : null}

      <div className="clientsplit">
        <div className="clientgrid">
          {!clients.length ? <div className="empty">No clients yet. Add the first person you edit for.</div> : null}
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"clientcard" + (c.id === selected ? " on" : "")}
              style={{ ["--c" as string]: c.color }}
              onClick={() => go({ page: "clients", client: c.id })}
            >
              <span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <b>{c.name}</b>
                <small>
                  {c.videos} {c.videos === 1 ? "video" : "videos"} · {c.kit ? "brand kit saved" : "no brand kit"}
                </small>
              </span>
            </button>
          ))}
        </div>
        {current ? <ClientDetail key={current.id} client={current} jobs={jobs} reload={reload} go={go} /> : null}
      </div>
    </div>
  );
};

const ClientDetail: React.FC<{ client: Client; jobs: JobSummary[]; reload: () => Promise<unknown>; go: (r: Route) => void }> = ({ client: c, jobs, reload, go }) => {
  const [name, setName] = useState(c.name);
  const [notes, setNotes] = useState(c.notes);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setName(c.name);
    setNotes(c.notes);
  }, [c.name, c.notes]);
  const theirs = jobs.filter((j) => j.client === c.id).sort((a, b) => b.updated - a.updated);
  const save = async (fields: Partial<Client>) => {
    try {
      await sendJSON(`/shorts/clients/${c.id}`, "PATCH", fields);
      await reload();
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const dropKit = async () => {
    if (!confirm(`Remove ${c.name}'s brand kit? Their videos keep their current style.`)) return;
    await api(`/shorts/clients/${c.id}/kit`, { method: "DELETE" });
    reload();
  };
  const remove = async () => {
    if (!confirm(`Delete ${c.name}? Their ${theirs.length} videos stay, without a client.`)) return;
    await api(`/shorts/clients/${c.id}`, { method: "DELETE" });
    await reload();
    go({ page: "clients", client: null });
  };

  return (
    <section className="card clientdetail" style={{ ["--c" as string]: c.color }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <input className="title-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && save({ name })} aria-label="Client name" />
        <button type="button" className="btn" onClick={() => go({ page: "new", client: c.id })}>
          ＋ New video for {c.name}
        </button>
      </div>
      <div className="swatches" style={{ margin: "6px 0 16px" }}>
        {COLORS.map((col) => (
          <button key={col} type="button" aria-label={col} className={"swatch" + (c.color === col ? " on" : "")} style={{ background: col }} onClick={() => save({ color: col })} />
        ))}
      </div>

      <label className="field">
        <span>Notes for Claude</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== c.notes && save({ notes })}
          placeholder="Read on every cut, plan, word check and post. e.g. “Tech reviewer, young audience. Spell ፖድካስት, TikTok, iPhone like this. Keep jokes. Ends every video with ‘ተከታተሉኝ’.”"
        />
      </label>
      {msg ? <p className="hint">{msg}</p> : null}

      <div className="section" style={{ marginTop: 16 }}>
        <h3>Brand kit</h3>
        {c.kit_summary ? (
          <>
            <div className="kitgrid">
              {Object.entries(c.kit_summary).map(([k, v]) => (
                <div key={k} className="fact">
                  <span>{KIT_NAMES[k] ?? k}</span>
                  <b style={{ textTransform: "capitalize" }}>{String(v ?? "–").replace(/_/g, " ")}</b>
                </div>
              ))}
            </div>
            <p className="hint">New videos for {c.name} start with this style. To update it, open one of their videos and choose ⋯ → Save style as brand kit.</p>
            <button type="button" className="btn ghost small" onClick={dropKit}>
              Remove brand kit
            </button>
          </>
        ) : (
          <p className="hint">
            No kit yet. Edit one of {c.name}'s videos the way they like it, then in the editor choose ⋯ → Save style as brand kit. Their next videos start from it.
          </p>
        )}
      </div>

      <div className="section">
        <h3>
          Videos <span className="hint">· {theirs.length}</span>
        </h3>
        <div className="videolist compact">
          {theirs.map((j) => {
            const s = statusOf(j);
            return (
              <button key={j.id} type="button" className="vrow" onClick={() => go({ page: "job", id: j.id })}>
                {j.thumb ? <img src={j.thumb} alt="" /> : <span className="ph" />}
                <span className="vtitle">
                  <b>{j.title}</b>
                  <span className="hint">{ago(j.updated)}</span>
                </span>
                <span className={"pill s-" + s.key}>{s.label}</span>
                <span className="chev">›</span>
              </button>
            );
          })}
          {!theirs.length ? <div className="empty">No videos for {c.name} yet.</div> : null}
        </div>
      </div>
      <div className="footer">
        <span className="hint">Deleting keeps the videos.</span>
        <button type="button" className="btn ghost small" onClick={remove}>
          Delete client
        </button>
      </div>
    </section>
  );
};
