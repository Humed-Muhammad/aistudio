import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { Faceless, type FacelessProps } from "../../../src/faceless/Faceless";
import { api, clock, sendJSON } from "../api";
import { mediaUrl, videoUrl, type ChannelSetup, type Shot, type ShotsState, type VideoState } from "./channelApi";

const KIND: Record<Shot["kind"], string> = {
  stock: "Stock",
  graphic: "Graphic",
  image: "AI image",
  ai_clip: "AI clip",
  chapter: "Chapter",
};

/** The live preview: the same Faceless composition the renderer uses, with the job's files. */
export const LivePreview: React.FC<{
  id: string;
  version: string;
  seek?: number;
  onError: (m: string) => void;
}> = ({ id, version, seek, onError }) => {
  const [props, setProps] = useState<FacelessProps | null>(null);
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    api<FacelessProps>(videoUrl(id, "props")).then(setProps, (e) => onError((e as Error).message));
  }, [id, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seek != null) player.current?.seekTo(seek);
  }, [seek]);
  if (!props)
    return (
      <div className="empty" style={{ aspectRatio: "16 / 9" }}>
        Loading the preview…
      </div>
    );
  return (
    <Player
      ref={player}
      component={Faceless}
      inputProps={props}
      durationInFrames={props.durationInFrames}
      fps={props.fps}
      compositionWidth={props.width}
      compositionHeight={props.height}
      controls
      style={{
        width: "100%",
        aspectRatio: `${props.width} / ${props.height}`,
        borderRadius: 12,
        overflow: "hidden",
        background: "#000",
      }}
      acknowledgeRemotionLicense
    />
  );
};

/** Every shot of the video: what it shows, its footage (swap a stock clip), what the AI visuals cost, and the plan by Claude. */
export const ShotsTab: React.FC<{
  v: VideoState;
  setup: ChannelSetup | null;
  busy: boolean;
  models: Record<string, string>;
  act: (path: string, body?: unknown) => void;
}> = ({ v, setup, busy, models, act }) => {
  const [s, setS] = useState<ShotsState | null>(null);
  const [error, setError] = useState("");
  const [model, setModel] = useState("sonnet");
  const [open, setOpen] = useState<string | null>(null);
  const [seek, setSeek] = useState<number>();
  const [approve, setApprove] = useState(false);
  const version = `${v.updated}-${v.state}`;
  useEffect(() => {
    api<ShotsState>(videoUrl(v.id, "shots")).then(setS, (e) => setError((e as Error).message));
  }, [v.id, version]);
  if (!v.words)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Voice the script first</h3>
        <p className="lead">Every shot is timed to the words of the voice-over.</p>
      </div>
    );
  if (!s) return <div className="empty">{error || "Loading…"}</div>;
  const plan = (
    <div className="row">
      <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Claude model" style={{ width: "auto" }}>
        {Object.entries(models).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button type="button" className={"btn" + (s.shots.length ? " ghost small" : "")} disabled={busy} onClick={() => act("shots", { model })}>
        {s.shots.length ? "Plan all shots again" : "Plan the shots with Claude →"}
      </button>
    </div>
  );
  if (!s.shots.length)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>No shots yet</h3>
        <p className="lead">
          Claude reads the timed narration and picks the picture for every few seconds: stock footage, graphics for every number and list, chapter cards, and AI visuals for the
          hook within your budget.
        </p>
        {!setup?.keys.pexels && !setup?.keys.pixabay ? (
          <div className="notice err">No PEXELS_API_KEY or PIXABAY_API_KEY in .env: without stock footage the video is graphics and words only. Both keys are free.</div>
        ) : null}
        {plan}
      </div>
    );
  const swap = async (shot: string, candidate: string) => {
    setError("");
    try {
      setS(
        await sendJSON<ShotsState>(videoUrl(v.id, "swap"), "POST", {
          shot,
          candidate,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const missing = s.shots.filter((x) => (x.kind === "stock" || x.kind === "image" || x.kind === "ai_clip") && !s.visuals[x.id]);
  const left = Math.max(0, s.budget - s.spent);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <LivePreview id={v.id} version={version} seek={seek} onError={setError} />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <b>{s.shots.length} shots</b>
            <span className="hint">
              {" "}
              · {missing.length ? `${missing.length} still need footage (shown as words for now)` : "footage for every shot"} · AI spent ${s.spent.toFixed(2)} of $
              {s.budget.toFixed(2)}
            </span>
          </div>
          {plan}
        </div>
        {s.costs.usd > 0 ? (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} disabled={!setup?.keys.fal || s.costs.usd > left} />
            Make {s.costs.todo.length} AI visual
            {s.costs.todo.length === 1 ? "" : "s"} for about ${s.costs.usd.toFixed(2)} (fal.ai, paid)
            {!setup?.keys.fal ? " · add FAL_KEY to .env first" : s.costs.usd > left ? " · over this video's budget" : ""}
          </label>
        ) : null}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => act("gather", { spend: approve ? s.costs.usd : 0 })}>
            {missing.length || s.costs.usd ? "Find the footage →" : "Check the footage again"}
          </button>
          <span className="hint">Stock clips are free; each is trimmed to its shot and the download deleted.</span>
        </div>
        {s.gather?.errors.length ? (
          <details className="warnbox" style={{ marginTop: 8 }}>
            <summary>
              {s.gather.errors.length} problem
              {s.gather.errors.length === 1 ? "" : "s"} finding footage
            </summary>
            <ul>
              {s.gather.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {s.scenes_warnings.length ? (
          <ul className="warnlist">
            {s.scenes_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="shotlist">
        {s.shots.map((x) => {
          const vis = s.visuals[x.id];
          const pick = vis?.candidates?.find((c) => c.id === vis.source_id);
          return (
            <div key={x.id} className={"shotrow" + (open === x.id ? " on" : "")}>
              <button type="button" className="shotmain" onClick={() => (setOpen(open === x.id ? null : x.id), setSeek(Math.round(x.start * 30)))}>
                <span className="mono hint">{clock(x.start)}</span>
                {pick?.thumb ? (
                  <img src={pick.thumb} alt="" />
                ) : vis?.kind === "image" ? (
                  <img src={mediaUrl(v.id, vis.file)} alt="" />
                ) : (
                  <span className={"shotph k-" + x.kind}>{KIND[x.kind].slice(0, 1)}</span>
                )}
                <span className="vtitle">
                  <b>{x.kind === "chapter" ? x.title : x.kind === "graphic" ? x.template : x.kind === "stock" || x.fallback ? x.query : x.prompt}</b>
                  <span className="hint">
                    {x.at ? `“${x.at}…”` : `start of ${x.p}`} · {(x.end - x.start).toFixed(1)} s
                  </span>
                </span>
                <span className={"tag" + (vis || x.kind === "graphic" || x.kind === "chapter" ? " ok" : "")}>
                  {KIND[x.kind]}
                  {x.mascot ? " · mascot" : ""}
                  {x.fallback ? " · no AI" : ""}
                </span>
              </button>
              {open === x.id && vis?.candidates?.length ? (
                <div className="candidates">
                  {vis.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={c.id === vis.source_id ? "on" : ""}
                      disabled={busy}
                      onClick={() => swap(x.id, c.id)}
                      title={`${c.credit} · ${c.duration}s`}
                    >
                      {c.thumb ? <img src={c.thumb} alt="" /> : c.id}
                    </button>
                  ))}
                </div>
              ) : null}
              {open === x.id && x.note ? (
                <p className="hint" style={{ margin: "6px 12px" }}>
                  {x.note}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="hint">
        To change a shot (another query, other words on a graphic, an AI image instead), ask Claude in the chat: “make shot sh7 a bar chart of the three numbers”.
      </p>
    </div>
  );
};

/** Draft and final renders of the long video. */
export const VideoTab: React.FC<{
  v: VideoState;
  busy: boolean;
  act: (path: string, body?: unknown) => void;
}> = ({ v, busy, act }) => (
  <div style={{ display: "grid", gap: 14 }}>
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0 }}>The long video · 1920×1080</h3>
          <span className="hint">Rendered on this Mac. A draft is half size and quicker; render the final once the draft looks right.</span>
        </div>
        <div className="row">
          <button type="button" className="btn secondary" disabled={busy || !v.voiced} onClick={() => act("render", { final: false })}>
            Render a draft
          </button>
          <button type="button" className="btn" disabled={busy || !v.voiced} onClick={() => act("render", { final: true })}>
            Render the final
          </button>
        </div>
      </div>
      {!v.voiced ? (
        <div className="notice err" style={{ marginTop: 12 }}>
          The voice-over does not match the script: voice the changed paragraphs first.
        </div>
      ) : null}
    </div>
    {(["final", "draft"] as const).map((n) =>
      v.files[`renders/${n}.mp4`] ? (
        <div key={n} className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <b>{n === "final" ? "Final" : "Draft"}</b>
            <a className="btn secondary small" href={mediaUrl(v.id, `renders/${n}.mp4`, v.files[`renders/${n}.mp4`])} download={`${v.title}-${n}.mp4`}>
              Download
            </a>
          </div>
          <video controls src={mediaUrl(v.id, `renders/${n}.mp4`, v.files[`renders/${n}.mp4`])} style={{ width: "100%", borderRadius: 10, background: "#000" }} />
        </div>
      ) : null,
    )}
  </div>
);
