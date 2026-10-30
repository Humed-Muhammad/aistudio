import { useEffect, useState } from "react";
import { api, clock, sendJSON } from "../api";
import { videoUrl, type Post, type PublishState, type VideoState, type YouTubeAccount } from "./channelApi";

const usePublish = (v: VideoState) => {
  const [s, setS] = useState<PublishState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<PublishState>(videoUrl(v.id, "publish")).then(setS, (e) => setError((e as Error).message));
  }, [v.id, v.updated, v.state]);
  return { s, setS, error, setError };
};

const ModelPick: React.FC<{
  models: Record<string, string>;
  value: string;
  set: (m: string) => void;
}> = ({ models, value, set }) => (
  <select value={value} onChange={(e) => set(e.target.value)} aria-label="Claude model" style={{ width: "auto" }}>
    {Object.entries(models).map(([k, l]) => (
      <option key={k} value={k}>
        {l}
      </option>
    ))}
  </select>
);

/** Shorts cut from the long video: Claude picks the moments, each is rendered 9:16 and lands in the Shorts editor with exact captions. */
export const ShortsTab: React.FC<{
  v: VideoState;
  busy: boolean;
  models: Record<string, string>;
  act: (path: string, body?: unknown) => void;
}> = ({ v, busy, models, act }) => {
  const { s, error } = usePublish(v);
  const [model, setModel] = useState("sonnet");
  const [edit, setEdit] = useState(false);
  if (!v.words)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Voice the script first</h3>
      </div>
    );
  if (!s) return <div className="empty">{error || "Loading…"}</div>;
  const todo = s.moments.filter((m) => !m.short).map((m) => m.n);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Shorts from this video</h3>
        <p className="lead">
          Claude picks the moments that work on their own (2–3 from a 3-minute video, 3–5 from a longer one). Each is rendered 9:16 from the same shots and added to Videos as a
          Shorts editor video with the exact words as captions (no transcription cost), ready for captions, a hook and sound.
        </p>
        <div className="row">
          <ModelPick models={models} value={model} set={setModel} />
          <button type="button" className={"btn" + (s.moments.length ? " secondary" : "")} disabled={busy} onClick={() => act("moments", { model })}>
            {s.moments.length ? "Find the moments again" : "Find the moments →"}
          </button>
        </div>
      </div>
      {s.moments.length ? (
        <div className="card">
          <div className="moments">
            {s.moments.map((m) => (
              <div key={m.n} className="moment">
                {m.file ? <video src={m.file} controls /> : null}
                <div className="mbody">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>
                      {m.n}. {m.title}
                    </b>
                    <span className="hint mono">
                      {clock(m.start)} · {Math.round(m.end - m.start)} s
                    </span>
                  </div>
                  <p style={{ margin: "6px 0" }}>“{m.hook}”</p>
                  <span className="why">{m.why}</span>
                  {m.short ? (
                    <p style={{ margin: "8px 0 0" }}>
                      <a href={`/shorts?job=${m.short.id}`}>Open in the Shorts editor ›</a>{" "}
                      <span className="hint">· {m.short.state === "running" ? m.short.status : m.short.stage}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {s.moment_warnings.length ? (
            <ul className="warnlist">
              {s.moment_warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          {todo.length ? (
            <div className="row" style={{ marginTop: 14 }}>
              <button type="button" className="btn" disabled={busy} onClick={() => act("shorts", { moments: todo, edit })}>
                Make {todo.length} short{todo.length === 1 ? "" : "s"} →
              </button>
              <label className="check" style={{ opacity: s.planner_available ? 1 : 0.6 }} title={s.planner_available ? "" : "Needs ANTHROPIC_API_KEY in .env"}>
                <input type="checkbox" checked={edit && s.planner_available} disabled={!s.planner_available} onChange={(e) => setEdit(e.target.checked)} />
                Edit each for me (captions, hook, sound · Claude API key)
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/** The post (titles, description with chapters, tags, thumbnails) and the upload. */
export const PublishTab: React.FC<{
  v: VideoState;
  busy: boolean;
  models: Record<string, string>;
  act: (path: string, body?: unknown) => void;
}> = ({ v, busy, models, act }) => {
  const { s, setS, error, setError } = usePublish(v);
  const [model, setModel] = useState("sonnet");
  const [draft, setDraft] = useState<Partial<Post>>({});
  const [account, setAccount] = useState<YouTubeAccount | null>(null);
  const [privacy, setPrivacy] = useState("private");
  const [when, setWhen] = useState("");
  const [thumb, setThumb] = useState(1);
  useEffect(() => {
    api<YouTubeAccount>("/channel/youtube").then(setAccount, () => setAccount(null));
  }, []);
  useEffect(() => setDraft({}), [s?.post]);
  if (!v.words)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Voice the script first</h3>
      </div>
    );
  if (!s) return <div className="empty">{error || "Loading…"}</div>;
  const post = s.post ? { ...s.post, ...draft } : null;
  const save = async () => {
    try {
      setS(await sendJSON<PublishState>(videoUrl(v.id, "post"), "PUT", draft));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const connect = async () => {
    try {
      const a = await sendJSON<YouTubeAccount>("/channel/youtube/login", "POST", {});
      if (a.login_url) window.open(a.login_url, "_blank");
      const poll = window.setInterval(async () => {
        const got = await api<YouTubeAccount>("/channel/youtube").catch(() => null);
        if (got?.connected) {
          setAccount(got);
          window.clearInterval(poll);
        }
      }, 2000);
      window.setTimeout(() => window.clearInterval(poll), 5 * 60_000);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const final = !!v.files["renders/final.mp4"];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>The post</h3>
          <div className="row">
            <ModelPick models={models} value={model} set={setModel} />
            <button type="button" className={"btn" + (post ? " secondary small" : "")} disabled={busy} onClick={() => act("package", { model })}>
              {post ? "Write it again" : "Write titles, description and thumbnails →"}
            </button>
          </div>
        </div>
        {post ? (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div className="field">
              <span>Title</span>
              <div className="artstyles">
                {post.titles.map((t) => (
                  <button key={t} type="button" className={"chip" + (post.title === t ? " on" : "")} onClick={() => setDraft((d) => ({ ...d, title: t }))}>
                    {t}
                  </button>
                ))}
              </div>
              <input value={post.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={100} />
              <small className="hint">{post.title.length}/100</small>
            </div>
            <label className="field">
              <span>Description (chapters, sources and credits included)</span>
              <textarea rows={12} value={post.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={post.tags.join(", ")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Pinned comment</span>
              <input value={post.pinned_comment} onChange={(e) => setDraft((d) => ({ ...d, pinned_comment: e.target.value }))} />
            </label>
            {post.best_time ? (
              <p className="hint" style={{ margin: 0 }}>
                When to post: {post.best_time}
              </p>
            ) : null}
            {Object.keys(draft).length ? (
              <div className="row">
                <button type="button" className="btn small" onClick={save}>
                  Save the post
                </button>
                <button type="button" className="btn ghost small" onClick={() => setDraft({})}>
                  Discard
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {s.thumbs.length ? (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Thumbnail</h3>
            <button type="button" className="btn ghost small" disabled={busy} onClick={() => act("thumbnails")}>
              Render again
            </button>
          </div>
          <div className="thumbpick">
            {s.thumbs.map((t, i) => (
              <button key={t} type="button" className={thumb === i + 1 ? "on" : ""} onClick={() => setThumb(i + 1)}>
                <img src={t} alt="" />
              </button>
            ))}
          </div>
          {post?.thumb_error ? <div className="notice err">{post.thumb_error}</div> : null}
        </div>
      ) : null}
      {post ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Upload to YouTube</h3>
          {s.upload ? (
            <div className="notice">
              Uploaded {s.upload.privacy}
              {s.upload.publish_at ? `, goes public ${new Date(s.upload.publish_at).toLocaleString()}` : ""}:{" "}
              <a href={s.upload.url} target="_blank" rel="noreferrer">
                {s.upload.url}
              </a>
            </div>
          ) : null}
          {!account?.client ? (
            <p className="hint">
              Optional. To upload from here, create a Google Cloud OAuth client (Desktop app) with the YouTube Data API enabled and save its JSON as youtube-oauth.json in the
              studio folder. Or download the final video, thumbnail and captions and upload them in YouTube Studio.
            </p>
          ) : !account.connected ? (
            <button type="button" className="btn secondary" onClick={connect}>
              Connect your YouTube channel
            </button>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <p className="hint" style={{ margin: 0 }}>
                Connected{account.channel ? ` to ${account.channel}` : ""}. A new Google project's uploads stay private until Google audits it: publish them in YouTube Studio.
              </p>
              <div className="row">
                <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} style={{ width: "auto" }}>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
                <label className="field" style={{ width: 240 }}>
                  <span>Publish at (optional, stays private until then)</span>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </label>
              </div>
              {post.synthetic ? (
                <p className="hint" style={{ margin: 0 }}>
                  It will carry YouTube's “altered or synthetic content” label (realistic AI visuals).
                </p>
              ) : null}
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !final}
                  onClick={() =>
                    confirm(`Upload “${post.title}” to YouTube as ${when ? "scheduled" : privacy}?`) &&
                    act("upload", {
                      privacy,
                      publish_at: when ? new Date(when).toISOString() : null,
                      thumb,
                    })
                  }
                >
                  {s.upload ? "Upload again as a new video" : "Upload the video"}
                </button>
                {!final ? <span className="hint">Render the final video first.</span> : null}
              </div>
            </div>
          )}
          <div className="exports" style={{ marginTop: 12 }}>
            {final ? (
              <a className="btn secondary small" href={`/runs/channel/videos/${v.id}/renders/final.mp4`} download={`${post.title}.mp4`}>
                Video
              </a>
            ) : null}
            {s.thumbs[thumb - 1] ? (
              <a className="btn secondary small" href={s.thumbs[thumb - 1]} download={`${post.title}-thumbnail.jpg`}>
                Thumbnail
              </a>
            ) : null}
            {v.files["captions.srt"] ? (
              <a className="btn secondary small" href={`/runs/channel/videos/${v.id}/captions.srt`} download={`${post.title}.srt`}>
                Captions (.srt)
              </a>
            ) : null}
            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigator.clipboard.writeText(`${post.title}\n\n${post.description}\n\nTags: ${post.tags.join(", ")}`)}
            >
              Copy title + description
            </button>
          </div>
        </div>
      ) : null}
      {error ? <div className="notice err">{error}</div> : null}
    </div>
  );
};
