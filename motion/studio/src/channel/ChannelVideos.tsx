import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ago, api, clock, sendJSON } from "../api";
import type { ChannelSetup, Profile, VideoState, VideoSummary } from "./channelApi";

const PILL: Record<string, string> = {
  New: "s-new",
  "Script ready": "s-new",
  Approved: "s-draft",
  Voiced: "s-draft",
  "Shots planned": "s-draft",
  "Visuals ready": "s-draft",
  "Draft ready": "s-draft",
  "Final ready": "s-final",
  Uploaded: "s-sent",
};
export const ACTION: Record<string, string> = {
  script: "Claude is writing",
  chat: "Claude is editing",
  voice: "Voicing",
  scenes: "Planning shots",
  gather: "Finding footage",
  render: "Rendering",
  shorts: "Making shorts",
  package: "Writing the post",
  upload: "Uploading",
  auto: "Making it for you",
};

/** Every channel video, newest first, and a box to start the next one. */
export const ChannelVideos: React.FC<{
  setup: ChannelSetup | null;
  profiles: Profile[];
  open: (id: string) => void;
  channels: () => void;
  ideas: () => void;
}> = ({ setup, profiles, open, channels, ideas }) => {
  const [list, setList] = useState<VideoSummary[] | null>(null);
  const [topic, setTopic] = useState("");
  const [profile, setProfile] = useState("");
  const [minutes, setMinutes] = useState(0);
  const [write, setWrite] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const timer = useRef<number>(undefined);
  const byId = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const load = useCallback(async () => {
    try {
      const got = await api<VideoSummary[]>("/channel/videos");
      setList(got);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, got.some((v) => v.state === "running") ? 3000 : 20000);
    } catch {
      timer.current = window.setTimeout(load, 20000);
    }
  }, []);
  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);
  useEffect(() => {
    if (!profile && profiles.length) setProfile(profiles[0].id);
  }, [profile, profiles]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const v = await sendJSON<VideoState>("/channel/videos", "POST", {
        profile,
        topic,
        minutes: minutes || undefined,
        write,
      });
      open(v.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Channel videos</h1>
          <p className="hint">Topic → researched script → your review → ElevenLabs voice → shots → long video and shorts.</p>
        </div>
        {profiles.length ? (
          <button type="button" className="btn secondary" onClick={ideas}>
            ✧ Find topic ideas
          </button>
        ) : null}
      </header>
      {!profiles.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Make your channel first</h3>
          <p className="lead">A channel profile holds the audience, the narrator's voice and the look every video starts from.</p>
          <button type="button" className="btn" onClick={channels}>
            Create a channel →
          </button>
        </div>
      ) : (
        <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div className="ytlink">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic or working title, e.g. Why is space completely silent?"
              aria-label="Topic"
              required
            />
            <button className="btn" disabled={sending || topic.trim().length < 4 || (write && !setup?.claude)}>
              {sending ? "Starting…" : write ? "Write the script →" : "Create"}
            </button>
          </div>
          <div className="row">
            <select value={profile} onChange={(e) => setProfile(e.target.value)} aria-label="Channel">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={minutes} onChange={(e) => setMinutes(+e.target.value)} aria-label="Length">
              <option value={0}>Channel's usual length ({byId[profile]?.minutes ?? 3} min)</option>
              {[3, 5, 8, 10, 12, 15, 20].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Claude researches and writes the script now (your Claude plan)
            </label>
          </div>
          {error ? <div className="notice err">{error}</div> : null}
        </form>
      )}

      <div className="videolist" style={{ marginTop: 18 }}>
        {list === null ? (
          <div className="empty">Loading…</div>
        ) : !list.length ? (
          <div className="empty">No videos yet. Pick a topic from your niche research, or type one above.</div>
        ) : null}
        {(list ?? []).map((v) => {
          const running = v.state === "running";
          return (
            <button key={v.id} type="button" className="vrow wide" onClick={() => open(v.id)}>
              {v.thumb ? <img src={v.thumb} alt="" /> : <span className="ph" />}
              <span className="vtitle">
                <b>{v.title}</b>
                <span className="hint">{byId[v.profile ?? ""]?.name ?? "No channel"}</span>
              </span>
              <span className={"pill " + (running ? "s-editing" : v.state === "error" ? "s-attention" : (PILL[v.stage] ?? "s-new"))}>
                {running
                  ? (ACTION[v.action ?? ""] ?? "Working") + (v.progress != null ? ` ${Math.round(v.progress * 100)}%` : "…")
                  : v.state === "error"
                    ? "Needs attention"
                    : v.stage}
              </span>
              <span className="hint mono">{v.duration ? clock(v.duration) : `~${v.minutes} min`}</span>
              <span className="hint">{ago(v.updated || v.created)}</span>
              <span className="chev">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
