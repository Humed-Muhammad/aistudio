import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { Film as FilmComponent, filmFrames } from "../../../src/film/Film";
import { SIZES } from "../../../src/film/types";
import { ago, api, clock, type Client } from "../api";
import { FORMAT_NAMES, type Film, type FilmSetup, type FilmState, type FilmSummary, type Starter } from "./filmApi";

/** Every film, newest first. */
export const FilmList: React.FC<{ films: FilmSummary[] | null; clients: Client[]; open: (id: string) => void; create: () => void }> = ({ films, clients, open, create }) => {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const shown = (films ?? []).filter((f) => !query.trim() || f.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Films</h1>
          <p className="hint">Promos, product films and explainers drawn in code: no footage or photos needed.</p>
        </div>
        <button type="button" className="btn" onClick={create}>
          ＋ New film
        </button>
      </header>
      <div className="filters">
        <input className="search" placeholder="Search films…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search films" />
      </div>
      {films === null ? <div className="empty">Loading…</div> : null}
      {films && !shown.length ? <div className="empty">{films.length ? "No films match." : "No films yet. Describe your first one and Claude makes it."}</div> : null}
      <div className="videolist">
        {shown.map((f) => {
          const c = f.client ? byId[f.client] : null;
          const running = f.state === "running";
          return (
            <button key={f.id} type="button" className="vrow" onClick={() => open(f.id)}>
              {f.thumb ? <img src={f.thumb} alt="" /> : <span className="ph" />}
              <span className="vtitle">
                <b>{f.title}</b>
                {c ? (
                  <span className="clientchip" style={{ ["--c" as string]: c.color }}>
                    {c.name}
                  </span>
                ) : (
                  <span className="hint">{FORMAT_NAMES[f.format]}</span>
                )}
              </span>
              <span className={"pill " + (running ? "s-editing" : f.state === "error" ? "s-attention" : f.stage === "Final ready" ? "s-final" : f.stage === "Draft ready" ? "s-draft" : "s-new")}>
                {running ? (f.action === "render" ? "Rendering" : "Claude is working") + (f.progress != null ? ` ${Math.round(f.progress * 100)}%` : "…") : f.state === "error" ? "Needs attention" : f.stage}
              </span>
              <span className="hint mono">{f.duration ? clock(f.duration) : "–"}</span>
              <span className="hint">{ago(f.updated || f.created)}</span>
              <span className="chev">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** A starter film playing small (on hover) so the creator sees what they start from. */
const StarterCard: React.FC<{ s: Starter; format: Film["format"]; onPick: () => void; disabled: boolean }> = ({ s, format, onPick, disabled }) => {
  const ref = useRef<PlayerRef>(null);
  const film = useMemo(() => ({ ...s.film, format }), [s.film, format]);
  const [w, h] = SIZES[format];
  const frames = Math.max(1, filmFrames(film, 30));
  const props = useMemo(() => ({ film, fps: 30, width: w, height: h, durationInFrames: frames, sounds: {}, assets: [], base: null }), [film, w, h, frames]);
  return (
    <button
      type="button"
      className="libtile startertile"
      disabled={disabled}
      onClick={onPick}
      onMouseEnter={() => ref.current?.play()}
      onMouseLeave={() => ref.current?.pause()}
    >
      <span className="libthumb" style={{ aspectRatio: `${w} / ${h}` }}>
        <Player ref={ref} component={FilmComponent} inputProps={props} durationInFrames={frames} fps={30} compositionWidth={w} compositionHeight={h} initialFrame={40} loop style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
      </span>
      <span className="libname">{s.title}</span>
      <small className="hint">{s.description}</small>
    </button>
  );
};

/** A new film: describe it and Claude makes it, or start from a starter film and change the words yourself. */
export const NewFilm: React.FC<{ setup: FilmSetup; clients: Client[]; client: string | null; onCreated: (id: string) => void }> = ({ setup, clients, client, onCreated }) => {
  const [request, setRequest] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Film["format"]>("portrait");
  const [language, setLanguage] = useState("en");
  const [who, setWho] = useState(client ?? "");
  const [model, setModel] = useState("sonnet");
  const [logo, setLogo] = useState<File | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Starter[]>("/motion/starters").then(setStarters, () => undefined);
  }, []);

  const create = async (make: boolean, starter = "") => {
    setWorking(true);
    setError("");
    const d = new FormData();
    d.set("title", title || (starter ? starters.find((s) => s.id === starter)?.title ?? "" : request.split(/[.,\n]/)[0].slice(0, 60)));
    d.set("format", format);
    d.set("language", language);
    d.set("client", who);
    d.set("request", request);
    d.set("model", model);
    d.set("make", String(make));
    d.set("starter", starter);
    if (logo) d.set("logo", logo);
    if (music) d.set("music", music);
    for (const f of images) d.append("images", f);
    try {
      const s = await api<FilmState>("/motion/films", { method: "POST", body: d });
      onCreated(s.id);
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  };

  return (
    <div className="page narrow" style={{ maxWidth: 980 }}>
      <header className="pagehead">
        <div>
          <h1>New film</h1>
          <p className="hint">Describe it in your own words. Claude plans every scene, builds it in code and checks each one. No footage or photos needed.</p>
        </div>
      </header>
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <label className="field">
          <span>What is the film?</span>
          <textarea
            dir="auto"
            rows={5}
            value={request}
            autoFocus
            onChange={(e) => setRequest(e.target.value)}
            placeholder="e.g. A 20-second launch film for Nimbo, an invoicing app for freelancers in Addis. Show creating an invoice on the phone, the reminder going out and the payment arriving. Blue and clean. End on nimbo.app and “Try it free”."
          />
        </label>
        <div className="formats">
          {(Object.keys(FORMAT_NAMES) as Film["format"][]).map((f) => {
            const [w, h] = setup.formats[f] ?? [1080, 1920];
            return (
              <button key={f} type="button" className={"formatpick" + (format === f ? " on" : "")} onClick={() => setFormat(f)}>
                <i style={{ aspectRatio: `${w} / ${h}` }} />
                {FORMAT_NAMES[f]}
              </button>
            );
          })}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label className="field">
            <span>Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>On-screen language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="am">Amharic (Ethiopic script)</option>
              <option value="om">Afaan Oromoo</option>
            </select>
          </label>
          <label className="field">
            <span>Client</span>
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Claude model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {Object.entries(setup.models).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details>
          <summary>Add a logo, music or images (optional)</summary>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 10 }}>
            <label className="field">
              <span>Logo</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
            </label>
            <label className="field">
              <span>Music bed</span>
              <input type="file" accept="audio/*" onChange={(e) => setMusic(e.target.files?.[0] ?? null)} />
            </label>
            <label className="field">
              <span>Screenshots or images</span>
              <input type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files ?? []))} />
            </label>
          </div>
        </details>
        {error ? <div className="notice err">! {error}</div> : null}
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={working || request.trim().length < 8 || !setup.claude} onClick={() => create(true)}>
            {working ? "Starting…" : "Make it with Claude"}
          </button>
          <button type="button" className="btn secondary" disabled={working} onClick={() => create(false)}>
            Start blank
          </button>
          <span className="hint">{setup.claude ? "Runs on your Claude plan, no API key. Usually a few minutes; you can watch it build." : "Install and sign in to Claude Code to have Claude make films."}</span>
        </div>
      </div>

      {starters.length ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Or start from a starter film</h2>
          <p className="hint">Hover to play. Pick one, then change the words in each scene or ask Claude in the chat.</p>
          <div className="libgrid startergrid">
            {starters.map((s) => (
              <StarterCard key={s.id} s={s} format={format} disabled={working} onPick={() => create(false, s.id)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
