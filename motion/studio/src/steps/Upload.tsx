import { useRef, useState } from "react";
import type { Setup } from "../App";
import type { Client, Job } from "../api";

// Same order as the server: natural file-name order, which follows the phone's recording order.
const naturalSort = (fs: File[]) =>
  [...fs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

export const Upload: React.FC<{ setup: Setup; clients: Client[]; client: string | null; onCreated: (id: string) => void }> = ({ setup, clients, client: initial, onCreated }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [client, setClient] = useState(initial ?? "");
  const who = clients.find((c) => c.id === client);
  const kit = who?.kit_summary;
  const [title, setTitle] = useState("");
  const [auto, setAuto] = useState(true);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const xhr = useRef<XMLHttpRequest | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const choose = (list: FileList | null) => {
    const fs = naturalSort([...(list ?? [])]);
    if (!fs.length) return;
    setFiles(fs);
    if (!title) setTitle(fs[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };
  const mb = (files.reduce((t, f) => t + f.size, 0) / 1048576).toFixed(0);
  const editForMe = auto && setup.planner_available;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) return;
    const data = new FormData(form.current!);
    data.delete("video");
    files.forEach((f) => data.append("video", f));
    data.set("auto", String(editForMe));
    const x = new XMLHttpRequest();
    xhr.current = x;
    setError("");
    setProgress({ loaded: 0, total: 1 });
    x.upload.onprogress = (p) => p.lengthComputable && setProgress({ loaded: p.loaded, total: p.total });
    x.onload = () => {
      setProgress(null);
      let j: Partial<Job> & { detail?: string } = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {
        // handled below
      }
      if (x.status >= 300 || !j.id) {
        setError(j.detail || "Upload failed.");
        return;
      }
      onCreated(j.id);
    };
    x.onabort = () => setProgress(null);
    x.onerror = () => {
      setProgress(null);
      setError("Upload failed. Is the app still running?");
    };
    x.open("POST", "/shorts/jobs");
    x.send(data);
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: 24 }}>New video</h2>
      <p className="lead">
        Upload a vertical recording, or several that are joined in order (up to 10 minutes in total). Claude edits
        it for you: cut, background, captions, graphics and sound. You review the draft.
      </p>
      <form ref={form} onSubmit={submit}>
        <label
          className={"dropzone" + (over ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            choose(e.dataTransfer.files);
          }}
        >
          <span className="icon">↑</span>
          <strong>
            {files.length > 1
              ? `${files.length} recordings · joined in this order`
              : files[0]?.name ?? "Drop your video here, or click to choose"}
          </strong>
          <span className="hint">
            {files.length > 1
              ? files.map((f, i) => `${i + 1}. ${f.name}`).join("   ") + ` · ${mb} MB`
              : files.length
                ? mb + " MB · ready to upload"
                : "MP4 or MOV · vertical 9:16 · select several recordings to join them"}
          </span>
          <input
            type="file"
            name="video"
            accept="video/*"
            multiple
            aria-label="Video files"
            onChange={(e) => choose(e.target.files)}
          />
        </label>

        <div
          className="ai"
          style={{ marginTop: 16, opacity: setup.planner_available ? 1 : 0.6 }}
        >
          <label className="check" style={{ fontSize: 14, color: "var(--text)", fontWeight: 650 }}>
            <input
              type="checkbox"
              checked={editForMe}
              disabled={!setup.planner_available}
              onChange={(e) => setAuto(e.target.checked)}
            />
            ✨ Edit it for me
          </label>
          <span className="hint">
            {setup.planner_available
              ? "Claude cuts retakes and dead air, picks a background look, adds captions, cards and zooms, then renders a draft. Uses your Anthropic API key (two Claude calls)."
              : "Add ANTHROPIC_API_KEY to .env to let Claude edit automatically. Without it you choose the cut and graphics yourself, or ask Claude Code."}
          </span>
          {editForMe ? (
            <textarea
              name="notes"
              rows={2}
              placeholder="Optional: what is this video about, and anything Claude should know. e.g. “Telegram bot pitch, keep the pricing part, end on the demo.”"
            />
          ) : null}
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Client</span>
            <select name="client" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">No client (my own video)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Title</span>
            <input name="title" value={title} maxLength={80} placeholder="e.g. Telegram bot pitch" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Spoken language</span>
            <select name="language" defaultValue="am" key={client}>
              <option value="am">Amharic (with English words)</option>
              <option value="en">English only</option>
              <option value="auto">Detect automatically</option>
            </select>
          </label>
          <label className="field" hidden={!!kit}>
            <span>Caption style</span>
            <select name="preset" defaultValue="duo">
              <option value="duo">Two-line glass (default)</option>
              <option value="auto">Let Claude choose</option>
              <option value="karaoke">Karaoke · words as spoken</option>
              <option value="pill">Pill · colour chip</option>
              <option value="typewriter">Typewriter</option>
              <option value="quiet">Quiet · calm serif</option>
              <option value="float">Float · soft glow</option>
              <option value="stack">Stack · big words</option>
              <option value="clean">Clean · white on dark box</option>
              <option value="editorial">Editorial · serif accent words</option>
              <option value="rise">Editorial · rise</option>
              <option value="bold">Bold · big words</option>
              <option value="boxed">Boxed highlight</option>
              <option value="minimal">Minimal</option>
              <option value="none">No captions</option>
            </select>
          </label>
          <label className="field">
            <span>Background noise</span>
            <select name="noise" defaultValue="off">
              <option value="off">Keep original audio</option>
              <option value="light">Light · fan, hum, hiss (free, on this Mac)</option>
              <option value="strong" disabled={!setup.strong_noise_available}>
                Strong · ElevenLabs (~1,000 credits/min)
              </option>
            </select>
          </label>
        </div>

        {kit ? (
          <div className="kitnote" style={{ ["--c" as string]: who!.color }}>
            <b>{who!.name}'s brand kit is used</b>
            <span className="hint">
              Look {kit.look.replace(/_/g, " ")} · {kit.captions} captions · {kit.graphics} graphics
              {kit.effect ? ` · ${kit.effect} effect` : ""}. Claude also reads {who!.name}'s notes.
            </span>
          </div>
        ) : who ? (
          <div className="kitnote" style={{ ["--c" as string]: who.color }}>
            <span className="hint">{who.name} has no brand kit yet: this video uses the defaults. Save its style as their kit when you like it.</span>
          </div>
        ) : null}

        {progress ? (
          <div className="activity" style={{ marginTop: 16 }}>
            <div className="spinner" />
            <div>
              <b>Uploading your video</b>
              <p>
                {(progress.loaded / 1048576).toFixed(0)} of {(progress.total / 1048576).toFixed(0)} MB
              </p>
              <div className="bar">
                <i style={{ width: `${(100 * progress.loaded) / progress.total}%` }} />
              </div>
            </div>
            <button type="button" className="btn secondary small" onClick={() => xhr.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : null}
        {error ? <div className="notice err" style={{ marginTop: 16 }}>{error}</div> : null}

        <div className="footer">
          <span className="hint">
            Your video stays on this Mac. Only the audio goes to ElevenLabs (if set up), and the transcript and a few
            frames go to Claude.
          </span>
          <button className="btn" disabled={!files.length || !!progress}>
            {editForMe ? "Upload & edit it for me →" : "Upload & transcribe →"}
          </button>
        </div>
      </form>
    </div>
  );
};
