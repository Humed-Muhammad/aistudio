import { useEffect, useMemo, useState } from "react";
import { ago, api, sendJSON } from "../api";
import type { ChannelSetup, Profile, Research, ResearchSummary } from "./channelApi";

/** Topic research for one channel: what to make next, from its niche (or a focus), its competitors' recent hits and what
 * people search, judged by Claude Code with a look at what is new on the web. */
export const TopicResearch: React.FC<{ setup: ChannelSetup | null; profiles: Profile[]; open: (id: string) => void; channels: () => void }> = ({
  setup,
  profiles,
  open,
  channels,
}) => {
  const [list, setList] = useState<ResearchSummary[] | null>(null);
  const [pid, setPid] = useState("");
  const [focus, setFocus] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [months, setMonths] = useState(3);
  const [searches, setSearches] = useState(1);
  const [model, setModel] = useState("sonnet");
  const [quota, setQuota] = useState<{ estimate: number; seeds: string[] } | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const profile = useMemo(() => profiles.find((p) => p.id === pid), [profiles, pid]);
  const byId = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  useEffect(() => {
    api<ResearchSummary[]>("/channel/research?kind=topics").then(setList, () => setList([]));
  }, []);
  useEffect(() => {
    if (!pid && profiles.length) setPid(profiles[0].id);
  }, [pid, profiles]);
  useEffect(() => setCompetitors((profile?.competitors ?? []).join("\n")), [profile]);
  const count = competitors.split(/[\n,]+/).filter((x) => x.trim()).length;
  useEffect(() => {
    if (!pid) return;
    const t = window.setTimeout(
      () =>
        api<{ estimate: number; seeds: string[] }>(`/channel/quota?profile=${pid}&focus=${encodeURIComponent(focus)}&searches=${searches}&competitors=${count}`).then(
          setQuota,
          () => setQuota(null),
        ),
      300,
    );
    return () => window.clearTimeout(t);
  }, [pid, focus, searches, count]);

  if (!profiles.length)
    return (
      <div className="page narrow">
        <div className="card">
          <h2 style={{ fontSize: 24 }}>Topic ideas</h2>
          <p className="lead">Topic research finds the next videos for a channel. Create your channel first (its niche, audience and voice).</p>
          <button type="button" className="btn" onClick={channels}>
            Create a channel →
          </button>
        </div>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const r = await sendJSON<Research>("/channel/research", "POST", { kind: "topics", profile: pid, focus, competitors, months, searches, model });
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
        <h2 style={{ fontSize: 24 }}>Topic ideas</h2>
        <p className="lead">
          What should your channel make next? The studio looks at what is pulling views in your niche right now, your competitors' recent hits and what people type into YouTube
          search. Claude Code checks what is new on the web and gives you ideas with an angle, three points and the evidence behind each.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div className="grid">
            <label className="field">
              <span>Channel</span>
              <select value={pid} onChange={(e) => setPid(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>From the last</span>
              <select value={months} onChange={(e) => setMonths(+e.target.value)}>
                <option value={1}>30 days (what is hot now)</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
            </label>
            <label className="field" title="Each search costs 100 of the 10,000 free daily YouTube units.">
              <span>Depth</span>
              <select value={searches} onChange={(e) => setSearches(+e.target.value)}>
                <option value={1}>Quick · 1 search per subject</option>
                <option value={2}>Normal · 2 searches per subject</option>
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
          <label className="field">
            <span>Look for (optional: leave empty to use the channel's niche{profile?.niche ? `, “${profile.niche}”` : ""})</span>
            <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. black holes, the Moon landing, ocean mysteries" />
          </label>
          <label className="field">
            <span>Competitor channels (one per line: @handle or link; remembered for this channel)</span>
            <textarea rows={3} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder={"@kurzgesagt\nhttps://www.youtube.com/@TheInfographicsShow"} />
          </label>
          {profile && !profile.niche && !focus.trim() ? (
            <div className="notice err">This channel has no niche yet: write what to look for, or add the niche on the Channels page.</div>
          ) : null}
          {setup && !setup.keys.youtube ? (
            <div className="notice err">No YOUTUBE_API_KEY in .env: ideas come from search phrases and the web only, without view counts or competitors.</div>
          ) : null}
          {error ? <div className="notice err">{error}</div> : null}
          <div className="row">
            <button className="btn" disabled={sending || !setup?.claude || (!profile?.niche && !focus.trim())}>
              {sending ? "Starting…" : "Find topics →"}
            </button>
            <span className="hint">
              {setup?.keys.youtube && quota
                ? `Searches “${quota.seeds.join("”, “")}” · up to ${quota.estimate.toLocaleString()} of ${left.toLocaleString()} free YouTube units left today. `
                : ""}
              Uses your Claude plan.
            </span>
          </div>
        </form>
      </div>

      <h3 style={{ margin: "26px 0 10px" }}>Past topic research</h3>
      {list === null ? <div className="empty">Loading…</div> : !list.length ? <div className="empty">Nothing yet.</div> : null}
      <div className="videolist">
        {(list ?? []).map((r) => (
          <button key={r.id} type="button" className="vrow research" onClick={() => open(r.id)}>
            <span className="vtitle">
              <b>
                {byId[r.profile ?? ""]?.name ?? "Channel"} · {r.focus || r.seeds.join(", ")}
              </b>
              <span className="hint">
                {r.topics} ideas{r.made ? ` · ${r.made} made` : ""}
                {r.skipped ? " · without YouTube data" : ""}
              </span>
            </span>
            <span className={"pill " + (r.state === "running" ? "s-editing" : r.state === "error" ? "s-attention" : r.best ? "s-final" : "s-new")}>
              {r.state === "running"
                ? "Working" + (r.progress != null ? ` ${Math.round(r.progress * 100)}%` : "")
                : r.state === "error"
                  ? "Needs attention"
                  : r.topics
                    ? "Ideas ready"
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
