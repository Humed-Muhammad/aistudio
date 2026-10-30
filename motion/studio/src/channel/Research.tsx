import { useCallback, useEffect, useRef, useState } from "react";
import { ago, api, clock, sendJSON } from "../api";
import { big, type ChannelSetup, type Niche, type Profile, type Research, type ResearchSummary, type Topic } from "./channelApi";
import { Markdown } from "./Markdown";

const VERDICT: Record<Niche["verdict"], string> = {
  go: "Start here",
  maybe: "Maybe",
  avoid: "Avoid",
};
const pct = (p: number | null) => (p == null ? "" : ` ${Math.round(p * 100)}%`);

/** Poll a research while it runs. */
const useResearch = (id: string) => {
  const [r, setR] = useState<Research | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<number>(undefined);
  const load = useCallback(async () => {
    try {
      const got = await api<Research>(`/channel/research/${id}`);
      setR(got);
      window.clearTimeout(timer.current);
      if (got.state === "running") timer.current = window.setTimeout(load, 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);
  return { r, setR, error, setError, load };
};

/** Seed ideas in, a niche report out: a free YouTube scan, then Claude Code judges the niches and lists topics. */
export const ResearchList: React.FC<{
  setup: ChannelSetup | null;
  profiles: Profile[];
  open: (id: string) => void;
}> = ({ setup, profiles, open }) => {
  const [list, setList] = useState<ResearchSummary[] | null>(null);
  const [seeds, setSeeds] = useState("");
  const [searches, setSearches] = useState(2);
  const [months, setMonths] = useState(12);
  const [model, setModel] = useState("sonnet");
  const [profile, setProfile] = useState("");
  const [estimate, setEstimate] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    api<ResearchSummary[]>("/channel/research?kind=niche").then(setList, () => setList([]));
  }, []);
  useEffect(() => {
    if (!seeds.trim() || !setup?.keys.youtube) return setEstimate(0);
    const t = window.setTimeout(
      () =>
        api<{ estimate: number }>(`/channel/quota?seeds=${encodeURIComponent(seeds)}&searches=${searches}`).then(
          (q) => setEstimate(q.estimate),
          () => {},
        ),
      300,
    );
    return () => window.clearTimeout(t);
  }, [seeds, searches, setup?.keys.youtube]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const r = await sendJSON<Research>("/channel/research", "POST", {
        seeds,
        searches,
        months,
        model,
        profile: profile || null,
      });
      open(r.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  const left = setup ? setup.quota.daily - setup.quota.used : 0;

  return (
    <div className="page narrow">
      <div className="card">
        <h2 style={{ fontSize: 24 }}>Find your niche</h2>
        <p className="lead">
          Write a few ideas you would enjoy making videos about. The studio searches YouTube for videos that already pulled views, especially from small and new channels, and
          Claude Code judges each niche and lists your first video ideas.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label className="field">
            <span>Seed ideas (comma or one per line, up to 10)</span>
            <textarea
              rows={3}
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              placeholder="space facts, history mysteries, personal finance for students, AI tools"
              required
            />
          </label>
          <div className="grid">
            <label className="field">
              <span>Channel</span>
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="">No channel yet</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Videos from the last</span>
              <select value={months} onChange={(e) => setMonths(+e.target.value)}>
                {[3, 6, 12, 24].map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </label>
            <label className="field" title="Each search costs 100 of the 10,000 free daily YouTube units.">
              <span>Depth</span>
              <select value={searches} onChange={(e) => setSearches(+e.target.value)}>
                <option value={1}>Quick · 1 search per idea</option>
                <option value={2}>Normal · 2 searches per idea</option>
                <option value={3}>Deep · 3 searches per idea</option>
              </select>
            </label>
            <label className="field">
              <span>Claude model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {Object.entries(setup?.models ?? { sonnet: "Sonnet" }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {setup && !setup.keys.youtube ? (
            <div className="notice err">
              No YOUTUBE_API_KEY in .env: Claude can only brainstorm without real numbers. A free key (YouTube Data API v3 in Google Cloud) gives 10,000 units a day, enough for
              about 15 scans.
            </div>
          ) : null}
          {setup && !setup.claude ? <div className="notice err">Claude Code is not installed: install the Claude Code VS Code extension or CLI.</div> : null}
          {error ? <div className="notice err">{error}</div> : null}
          <div className="row">
            <button className="btn" disabled={sending || !seeds.trim() || !setup?.claude}>
              {sending ? "Starting…" : "Research these ideas →"}
            </button>
            <span className="hint">
              {setup?.keys.youtube ? `Uses up to ${estimate.toLocaleString()} of ${left.toLocaleString()} YouTube units left today (free). ` : ""}
              The report uses your Claude plan, not an API key.
            </span>
          </div>
        </form>
      </div>

      <h3 style={{ margin: "26px 0 10px" }}>Past research</h3>
      {list === null ? <div className="empty">Loading…</div> : !list.length ? <div className="empty">Nothing yet.</div> : null}
      <div className="videolist">
        {(list ?? []).map((r) => (
          <button key={r.id} type="button" className="vrow research" onClick={() => open(r.id)}>
            <span className="vtitle">
              <b>{r.seeds.join(", ")}</b>
              <span className="hint">
                {r.skipped ? "Brainstorm (no YouTube data)" : `${r.videos} videos scanned`} · {r.topics} topic ideas
              </span>
            </span>
            <span className={"pill " + (r.state === "running" ? "s-editing" : r.state === "error" ? "s-attention" : r.best ? "s-final" : "s-new")}>
              {r.state === "running"
                ? "Working" + pct(r.progress)
                : r.state === "error"
                  ? "Needs attention"
                  : r.best
                    ? "Start with " + r.best
                    : r.state === "done"
                      ? "Report ready"
                      : "Stopped"}
            </span>
            <span className="hint">{ago(r.created)}</span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const Score: React.FC<{ label: string; value: number; invert?: boolean }> = ({ label, value, invert }) => (
  <span className="score" title={`${label}: ${value} of 5`}>
    <small>{label}</small>
    <span className={"dots" + (invert ? " invert" : "")}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  </span>
);

/** One research: for a niche research the report, the niches with their evidence, topic ideas and the videos behind them;
 * for a topic research (one channel) the video ideas first, the search phrases and the competitors' outliers. */
export const ResearchView: React.FC<{
  id: string;
  setup: ChannelSetup | null;
  back: (kind: "niche" | "topics") => void;
  makeVideo?: (t: Topic, profile: string | null) => void;
  openVideo?: (id: string) => void;
  /** Tells the sidebar which kind of research is open. */
  onKind?: (kind: "niche" | "topics") => void;
}> = ({ id, setup, back, makeVideo, openVideo, onKind }) => {
  const { r, setR, error, setError, load } = useResearch(id);
  useEffect(() => {
    if (r?.kind) onKind?.(r.kind);
  }, [r?.kind, onKind]);
  const [picked, setTab] = useState<"report" | "topics" | "videos" | "searches" | null>(null);
  const [model, setModel] = useState("");
  if (!r) return <div className="page narrow">{error ? <div className="notice err">{error}</div> : <div className="empty">Loading…</div>}</div>;
  const topical = r.kind === "topics";
  const tab = picked ?? (topical ? "topics" : "report");
  const phrases = Object.entries(r.suggestions ?? {}).filter(([, list]) => list.length);
  const videos = Object.fromEntries(r.videos.map((v) => [v.id, v]));
  const act = async (path: string, body: unknown = {}) => {
    setError("");
    try {
      setR(await sendJSON<Research>(`/channel/research/${id}/${path}`, "POST", body));
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this research?")) return;
    await api(`/channel/research/${id}`, { method: "DELETE" }).catch(() => {});
    back(r.kind);
  };
  const res = r.result;
  return (
    <div className="page narrow">
      <header className="pagehead">
        <div>
          <button type="button" className="btn ghost small" onClick={() => back(r.kind)}>
            ‹ {topical ? "Topic ideas" : "Research"}
          </button>
          <h1 style={{ marginTop: 10 }}>{topical ? `Topics: ${r.focus || r.seeds.join(", ")}` : r.seeds.join(", ")}</h1>
          <p className="hint">
            {r.skipped ? r.skipped : `${r.videos.length} videos from the last ${r.request?.months ?? 12} months · ${r.units} YouTube units used`}
            {topical && r.competitors.length ? ` · ${r.competitors.length} competitor${r.competitors.length === 1 ? "" : "s"}` : ""} · {ago(r.created)}
          </p>
        </div>
        <div className="row">
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Claude model" disabled={r.state === "running"} style={{ width: "auto" }}>
            <option value="">Same model</option>
            {Object.entries(setup?.models ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" className="btn secondary small" disabled={r.state === "running"} onClick={() => act("report", model ? { model } : {})}>
            {topical ? "New ideas from this scan" : "Rewrite report"}
          </button>
          <button type="button" className="btn secondary small" disabled={r.state === "running"} onClick={() => act("scan")}>
            Scan again
          </button>
          <button type="button" className="btn ghost small" disabled={r.state === "running"} onClick={remove}>
            Delete
          </button>
        </div>
      </header>
      {r.state === "running" ? (
        <div className="activity">
          <div className="spinner" />
          <div>
            <b>{r.status || "Working…"}</b>
            <p>A scan takes a minute; Claude's report a few more. You can leave this page.</p>
            <div className={"bar" + (r.progress == null ? " indeterminate" : "")}>
              <i style={r.progress == null ? undefined : { width: `${Math.round(r.progress * 100)}%` }} />
            </div>
          </div>
          <button type="button" className="btn secondary small" onClick={() => act("cancel")}>
            Cancel
          </button>
        </div>
      ) : null}
      {r.state === "error" ? <div className="notice err">{r.status}</div> : null}
      {error ? <div className="notice err">{error}</div> : null}
      {r.competitor_problems?.length ? <div className="notice err">{r.competitor_problems.join(" ")}</div> : null}

      {res ? (
        <>
          <div className="seg" style={{ marginBottom: 14 }}>
            {[
              ...((topical
                ? [
                    ["topics", `Video ideas (${res.topics.length})`],
                    ["report", "Summary"],
                  ]
                : [
                    ["report", "Report"],
                    ["topics", `Video ideas (${res.topics.length})`],
                  ]) as ["report" | "topics", string][]),
              ...(phrases.length ? [["searches", "What people search"] as ["searches", string]] : []),
              ["videos", topical ? `Videos scanned (${r.videos.length})` : `Proven videos (${r.videos.length})`] as ["videos", string],
            ].map(([k, l]) => (
              <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === "report" ? (
            <>
              <div className="niches">
                {res.niches.map((n) => (
                  <div key={n.name} className={"card niche v-" + n.verdict}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 style={{ margin: 0 }}>{n.name}</h3>
                      <span className={"pill " + (n.verdict === "go" ? "s-final" : n.verdict === "avoid" ? "s-attention" : "s-draft")}>{VERDICT[n.verdict]}</span>
                    </div>
                    <div className="row" style={{ margin: "10px 0" }}>
                      <Score label="Demand" value={n.demand} />
                      <Score label="Competition" value={n.competition} invert />
                      <Score label="Faceless fit" value={n.faceless_fit} />
                    </div>
                    <p className="hint" style={{ margin: "0 0 6px" }}>
                      RPM {n.rpm} · policy risk {n.policy_risk}
                    </p>
                    <p style={{ margin: "0 0 6px" }}>{n.why}</p>
                    {n.angle ? <span className="why">Your angle: {n.angle}</span> : null}
                    {n.evidence.length ? (
                      <div className="evidence">
                        {n.evidence.map((v) =>
                          videos[v] ? (
                            <a key={v} href={videos[v].url} target="_blank" rel="noreferrer" title={videos[v].title}>
                              {videos[v].thumb ? <img src={videos[v].thumb!} alt="" /> : null}
                              <small>{big(videos[v].views)} views</small>
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginTop: 14 }}>
                <Markdown text={res.summary} />
              </div>
              {r.competitors?.length ? (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>Competitors watched</h3>
                  <div className="facts">
                    {r.competitors.map((c) => (
                      <a key={c.id} className="fact" href={c.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <span>{c.title}</span>
                        <b>
                          {big(c.subs)} subs · usually {big(c.median_views)} views
                        </b>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {r.summary_rows.length ? (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>The numbers</h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Idea</th>
                        <th>Videos</th>
                        <th>Median views</th>
                        <th>Median channel</th>
                        <th title="Videos with 50K+ views from channels under 50K subscribers">Small-channel hits</th>
                        <th title="Videos with 50K+ views from channels under a year old">New-channel hits</th>
                        <th title="Share of views held by the 3 biggest channels">Top 3 share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.summary_rows.map((s) => (
                        <tr key={s.seed}>
                          <td>{s.seed}</td>
                          <td>{s.videos}</td>
                          <td>{big(s.median_views)}</td>
                          <td>{big(s.median_channel_subs)}</td>
                          <td>{s.small_channel_hits ?? "–"}</td>
                          <td>{s.young_channel_hits ?? "–"}</td>
                          <td>{s.top3_share != null ? Math.round(s.top3_share * 100) + "%" : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : tab === "searches" ? (
            <div className="card" style={{ display: "grid", gap: 14 }}>
              <p className="hint" style={{ margin: 0 }}>
                What people type into YouTube search: titles that use these words get found.
              </p>
              {phrases.map(([seed, list]) => (
                <div key={seed}>
                  <b>{seed}</b>
                  <div className="artstyles" style={{ marginTop: 6 }}>
                    {list.map((x) => (
                      <a key={x} className="chip" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(x)}`} target="_blank" rel="noreferrer">
                        {x}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "topics" ? (
            <div className="topics">
              {res.topics.map((t, i) => (
                <div key={i} className="topic">
                  <span className="topicscore">{t.score}</span>
                  <div>
                    <b>{t.title}</b>
                    {t.kind ? <span className={"tag" + (t.kind === "trending" ? " accent" : "")}>{t.kind === "trending" ? "Trending" : "Evergreen"}</span> : null}
                    {t.niche ? <span className="hint"> · {t.niche}</span> : null}
                    <p className="hint" style={{ margin: "4px 0" }}>
                      “{t.hook}”
                    </p>
                    {t.angle ? <p style={{ margin: "4px 0" }}>{t.angle}</p> : null}
                    {t.points?.length ? (
                      <ol className="points">
                        {t.points.map((x, k) => (
                          <li key={k}>{x}</li>
                        ))}
                      </ol>
                    ) : null}
                    {t.why_now ? (
                      <p className="hint" style={{ margin: "4px 0" }}>
                        Why now: {t.why_now}
                      </p>
                    ) : null}
                    <span className="why">{t.why}</span>
                    {t.searches?.length ? (
                      <div className="artstyles" style={{ margin: "6px 0" }}>
                        {t.searches.map((x) => (
                          <span key={x} className="chip" title="People search this">
                            ⌕ {x}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {t.links?.length ? (
                      <small className="hint">
                        Sources:{" "}
                        {t.links.map((u, k) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer">
                            {k ? ", " : ""}
                            {new URL(u).hostname.replace(/^www\./, "")}
                          </a>
                        ))}{" "}
                      </small>
                    ) : null}
                    {t.based_on.length ? (
                      <small className="hint">
                        {" "}
                        Based on{" "}
                        {t.based_on.map((v, k) =>
                          videos[v] ? (
                            <a key={v} href={videos[v].url} target="_blank" rel="noreferrer">
                              {k ? ", " : ""}
                              {videos[v].title}
                            </a>
                          ) : null,
                        )}
                      </small>
                    ) : null}
                  </div>
                  {r.made_videos?.[t.title] && openVideo ? (
                    <button type="button" className="btn secondary small" onClick={() => openVideo(r.made_videos[t.title])}>
                      Made · open ›
                    </button>
                  ) : makeVideo ? (
                    <button type="button" className="btn small" onClick={() => makeVideo(t, r.request?.profile ?? null)}>
                      Make this video →
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="videolist">
              {r.videos.slice(0, 150).map((v) => (
                <a key={v.id} className="vrow ytvideo" href={v.url} target="_blank" rel="noreferrer">
                  {v.thumb ? <img src={v.thumb} alt="" /> : <span className="ph" />}
                  <span className="vtitle">
                    <b>{v.title}</b>
                    <span className="hint">
                      {v.competitor ? "Competitor · " : ""}
                      {v.channel} · {big(v.channel_subs)} subs
                      {v.channel_age_days != null && v.channel_age_days < 365 ? " · new channel" : ""}
                    </span>
                  </span>
                  <span className="hint mono">{big(v.views)} views</span>
                  <span className={"pill " + ((v.outlier ?? 0) >= 3 ? "s-final" : "s-new")} title="Views compared with the channel's usual (median) views">
                    {v.outlier != null ? `${v.outlier}× usual` : v.views_per_sub != null ? `${v.views_per_sub}× subs` : "–"}
                  </span>
                  <span className="hint mono">{clock(v.duration)}</span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : r.state !== "running" && r.state !== "error" ? (
        <div className="empty">No report yet.</div>
      ) : null}
    </div>
  );
};
