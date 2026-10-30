import { useCallback, useEffect, useRef, useState } from "react";
import { api, sendJSON } from "../api";
import { ACTION } from "./ChannelVideos";
import { videoUrl, type ChannelSetup, type ChatMessage, type ChatState, type Profile, type Script, type VideoState } from "./channelApi";
import { ScriptTab } from "./ScriptTab";
import { VoiceTab } from "./VoiceTab";
import { ShotsTab, VideoTab } from "./ShotsTab";
import { PublishTab, ShortsTab } from "./PublishTabs";

type Tab = "script" | "voice" | "shots" | "video" | "shorts" | "publish";
const TABS: [Tab, string, string][] = [
  ["script", "Script", "✎"],
  ["voice", "Voice", "♪"],
  ["shots", "Shots", "▦"],
  ["video", "Video", "▶"],
  ["shorts", "Shorts", "▯"],
  ["publish", "Publish", "↑"],
];

/** Chat with Claude Code about this video: it edits the script (and later the shots and post) in place; each change can be undone. */
const VideoChat: React.FC<{
  id: string;
  models: Record<string, string>;
  running: boolean;
  onVideo: (v: VideoState) => void;
  onClose: () => void;
}> = ({ id, models, running, onVideo, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("sonnet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const take = useCallback(
    (c: ChatState) => {
      setMessages(c.messages);
      onVideo(c.video);
      const going = c.status.state === "running" && c.status.action === "chat";
      setBusy(going);
      window.clearTimeout(timer.current);
      if (going) timer.current = window.setTimeout(() => api<ChatState>(videoUrl(id, "chat")).then(take, () => undefined), 1500);
    },
    [id, onVideo],
  );
  useEffect(() => {
    api<ChatState>(videoUrl(id, "chat")).then(take, (e) => setError((e as Error).message));
    return () => window.clearTimeout(timer.current);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);
  const send = async () => {
    const message = draft.trim();
    if (!message || running || busy) return;
    setDraft("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: message, time: Date.now() / 1000 }]);
    try {
      take(
        await sendJSON<ChatState>(videoUrl(id, "chat"), "POST", {
          message,
          model,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setDraft(message);
    }
  };
  return (
    <aside className="chat videochat">
      <div className="chathead">
        <b>Ask Claude</b>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Claude model">
          {Object.entries(models).map(([k, l]) => (
            <option key={k} value={k}>
              {l.split(" · ")[0]}
            </option>
          ))}
        </select>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>
      <div className="chatlist" ref={list}>
        {!messages.length ? (
          <div className="chatempty">
            <p>Ask for one change at a time. Claude edits the script in place and you can undo each change.</p>
            {["Make the hook punchier", "Add a real-world example to chapter 2", "Make it 30 seconds shorter", "Check the numbers in chapter 3 again"].map((x) => (
              <button key={x} type="button" className="chip" onClick={() => setDraft(x)}>
                {x}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={"msg " + m.role + (m.undone ? " undone" : "")}>
            <p>{m.text || (m.error ? "" : "…")}</p>
            {m.changes?.length ? (
              <small className="hint">
                Changed {m.changes.join(", ")}
                {m.undone ? " · undone" : ""}
              </small>
            ) : null}
            {m.error ? <small className="notice err">{m.error}</small> : null}
          </div>
        ))}
        {busy ? (
          <div className="msg assistant">
            <div className="spinner" />
          </div>
        ) : null}
      </div>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="chatinput">
        <textarea
          value={draft}
          rows={2}
          placeholder={running ? "Wait for the current step to finish…" : "What should change?"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="btn small" disabled={running || busy || !draft.trim()} onClick={send}>
          Send
        </button>
      </div>
    </aside>
  );
};

/** After the creator approved the script: the rest in one go, with the credits and the AI spend cap stated up front. */
const FinishCard: React.FC<{
  v: VideoState;
  profile: Profile | undefined;
  busy: boolean;
  finish: (credits: number, spend: number) => void;
}> = ({ v, profile, busy, finish }) => {
  const [spend, setSpend] = useState(profile?.ai_budget ?? 0);
  const credits = v.voice?.credits ?? 0;
  if (!v.approved || v.files["renders/draft.mp4"] || !profile?.voice.id) return null;
  return (
    <div className="card finishcard">
      <div>
        <b>✨ Finish it for me</b>
        <p className="hint" style={{ margin: "2px 0 0" }}>
          Voice-over
          {credits ? ` (${credits.toLocaleString()} ElevenLabs credits)` : ""} → Claude plans the shots → illustrations (fal.ai, at most ${spend.toFixed(2)}) → a draft render →
          titles, description and thumbnails. You review the draft.
        </p>
      </div>
      <label className="field" style={{ width: 150 }}>
        <span>AI visuals up to ($)</span>
        <input type="number" min={0} max={profile.ai_budget} step={0.5} value={spend} onChange={(e) => setSpend(Math.min(profile.ai_budget, +e.target.value))} />
      </label>
      <button type="button" className="btn" disabled={busy} onClick={() => finish(credits, spend)}>
        Finish it →
      </button>
    </div>
  );
};

/** One channel video, step by step: script (with the creator's review), voice-over, and the steps after it. */
export const VideoView: React.FC<{
  id: string;
  setup: ChannelSetup | null;
  profiles: Profile[];
  back: () => void;
  channels: () => void;
}> = ({ id, setup, profiles, back, channels }) => {
  const [v, setV] = useState<VideoState | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const want = new URLSearchParams(location.search).get("tab") as Tab | null;
    return want && TABS.some(([k]) => k === want) ? want : "script";
  });
  const [chat, setChat] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number>(undefined);
  const load = useCallback(async () => {
    try {
      const got = await api<VideoState>(videoUrl(id));
      setV(got);
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
  const take = useCallback(
    (got: VideoState) => {
      setV(got);
      window.clearTimeout(timer.current);
      if (got.state === "running") timer.current = window.setTimeout(load, 2000);
    },
    [load],
  );
  const call = async (path: string, body: unknown = {}, method = "POST") => {
    setError("");
    try {
      take(await sendJSON<VideoState>(videoUrl(id, path), method, body));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!v) return <div className="page">{error ? <div className="notice err">{error}</div> : <div className="empty">Loading…</div>}</div>;
  const running = v.state === "running";
  const profile = profiles.find((p) => p.id === v.profile);
  const models = setup?.models ?? { sonnet: "Sonnet" };
  const remove = async () => {
    if (!confirm(`Delete “${v.title}” and everything made for it?`)) return;
    await api(videoUrl(id), { method: "DELETE" }).catch(() => {});
    back();
  };
  return (
    <div className={"videoedit" + (chat ? " chatting" : "")}>
      <div className="page">
        <header className="pagehead">
          <div>
            <button type="button" className="btn ghost small" onClick={back}>
              ‹ Channel videos
            </button>
            <h1 style={{ marginTop: 10 }}>{v.title}</h1>
            <p className="hint">
              {profile?.name ?? "No channel"} · {v.stage}
              {v.job.research ? " · from niche research" : ""}
            </p>
          </div>
          <div className="row">
            {v.can_undo ? (
              <button type="button" className="btn secondary small" disabled={running} onClick={() => call("undo")} title="Put back the files from before Claude's last change">
                ↶ Undo Claude
              </button>
            ) : null}
            <button type="button" className={"btn small" + (chat ? "" : " secondary")} onClick={() => setChat((c) => !c)} disabled={!setup?.claude}>
              ✦ Ask Claude
            </button>
            <button type="button" className="btn ghost small" disabled={running} onClick={remove}>
              Delete
            </button>
          </div>
        </header>
        <div className="seg steps" style={{ marginBottom: 14 }}>
          {TABS.map(([k, label, ico]) => (
            <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {ico} {label}
            </button>
          ))}
        </div>
        {running ? (
          <div className="activity">
            <div className="spinner" />
            <div>
              <b>{v.status || ACTION[v.action ?? ""] || "Working…"}</b>
              <p>You can leave this page; it keeps going.</p>
              <div className={"bar" + (v.progress == null ? " indeterminate" : "")}>
                <i style={v.progress == null ? undefined : { width: `${Math.round(v.progress * 100)}%` }} />
              </div>
            </div>
            <button type="button" className="btn secondary small" onClick={() => call("cancel")}>
              Cancel
            </button>
          </div>
        ) : v.state === "error" ? (
          <div className="notice err">{v.status}</div>
        ) : v.state === "done" && v.status && v.status !== "Done" ? (
          <div className="notice">{v.status}</div>
        ) : null}
        {error ? <div className="notice err">{error}</div> : null}
        <FinishCard v={v} profile={profile} busy={running} finish={(credits, spend) => call("finish", { credits, spend })} />
        {tab === "script" ? (
          <ScriptTab
            v={v}
            busy={running}
            models={models}
            save={(s: Script) => call("script", s, "PUT")}
            write={(model) => call("script", { model })}
            approve={(on) => call("approve", { on })}
            perform={(model) => call("perform", { model })}
          />
        ) : tab === "voice" ? (
          <VoiceTab v={v} profile={profile} busy={running} speak={(credits) => call("voice", { credits })} channels={channels} />
        ) : tab === "shots" ? (
          <ShotsTab v={v} setup={setup} busy={running} models={models} act={(path, body) => call(path, body ?? {})} />
        ) : tab === "video" ? (
          <VideoTab v={v} busy={running} act={(path, body) => call(path, body ?? {})} />
        ) : tab === "shorts" ? (
          <ShortsTab v={v} busy={running} models={models} act={(path, body) => call(path, body ?? {})} />
        ) : (
          <PublishTab v={v} busy={running} models={models} act={(path, body) => call(path, body ?? {})} />
        )}
      </div>
      {chat ? <VideoChat id={id} models={models} running={running && v.action !== "chat"} onVideo={take} onClose={() => setChat(false)} /> : null}
    </div>
  );
};
