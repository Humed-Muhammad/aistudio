import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import { sceneAt, sceneStart } from "../../../src/film/Film";
import { SCENES } from "../../../src/film/registry.gen";
import { ago, api, clock, sendJSON, type Client } from "../api";
import { DeliverTab } from "./DeliverTab";
import { FilmChat } from "./FilmChat";
import { FilmPreview } from "./FilmPreview";
import { FilmTab } from "./FilmTab";
import { ACTION_NAMES, filmUrl, FORMAT_NAMES, getFilm, type Film, type FilmSetup, type FilmState, type Scene } from "./filmApi";
import { MakeTab } from "./MakeTab";
import { SceneLibrary } from "./SceneLibrary";
import { SceneStrip } from "./SceneStrip";
import { SceneTab } from "./SceneTab";

type Tab = "claude" | "scene" | "film" | "deliver";
const SECTIONS: [Tab, string, string][] = [
  ["claude", "✦", "Claude"],
  ["scene", "▤", "Scene"],
  ["film", "◐", "Film"],
  ["deliver", "⇪", "Deliver"],
];

const newId = (film: Film) => {
  let n = film.scenes.length + 1;
  while (film.scenes.some((s) => s.id === `s${n}`)) n++;
  return `s${n}`;
};

/**
 * The film editor: chat with Claude on the left, the live film in the middle with its scenes underneath, the selected
 * scene or the whole film's settings on the right. Every edit shows at once and saves itself.
 */
export const FilmView: React.FC<{ id: string; setup: FilmSetup; clients: Client[]; onChange: () => void; onBack: () => void; onDeleted: () => void }> = ({
  id,
  setup,
  clients,
  onChange,
  onBack,
  onDeleted,
}) => {
  const [state, setState] = useState<FilmState | null>(null);
  const [film, setFilm] = useState<Film | null>(null);
  const [tab, setTab] = useState<Tab>("claude");
  const [selected, setSelected] = useState(0);
  const [frame, setFrame] = useState(0);
  const [library, setLibrary] = useState<"add" | "swap" | null>(null);
  const [notice, setNotice] = useState<{ msg: string; error: boolean } | null>(null);
  const [view, setView] = useState<"live" | "draft" | "final">("live");
  const [chat, setChat] = useState(() => {
    try {
      return localStorage.getItem("film-chat") !== "closed";
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState(Date.now());
  const player = useRef<PlayerRef>(null);
  const poll = useRef<number>(undefined);
  const saveTimer = useRef<number>(undefined);
  const pending = useRef<Film | null>(null);
  const seen = useRef<number | null>(null);
  const lastFinish = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string, error = false) => setNotice({ msg, error }), []);

  /** Take the server's state; its film replaces the local one unless the creator has edits still being saved. */
  const show = useCallback(
    (s: FilmState) => {
      setState(s);
      if (!pending.current && s.edited !== seen.current) {
        seen.current = s.edited;
        setFilm(s.film);
      }
      for (const t of [s.claude, s.render])
        if (t.state === "done" && t.finished && Date.now() / 1000 - t.finished < 30 && lastFinish.current !== undefined && lastFinish.current < t.finished) setNotice({ msg: t.status, error: false });
      lastFinish.current = Math.max(lastFinish.current ?? 0, s.claude.finished ?? 0, s.render.finished ?? 0);
    },
    [],
  );

  const refresh = useCallback(async () => {
    window.clearTimeout(poll.current);
    try {
      const s = await getFilm(id);
      show(s);
      if (s.claude.state === "running" || s.render.state === "running") poll.current = window.setTimeout(refresh, 1500);
    } catch (e) {
      if (/no such film/i.test((e as Error).message)) onDeleted();
      else toast((e as Error).message, true);
    }
  }, [id, show, onDeleted, toast]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(poll.current);
      window.clearInterval(t);
      window.clearTimeout(saveTimer.current);
    };
  }, [refresh]);

  /** Change the film locally (the preview shows it at once) and save it shortly after the last change. */
  const edit = useCallback(
    (next: Film) => {
      setFilm(next);
      pending.current = next;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const sent = pending.current;
        try {
          const s = await sendJSON<FilmState>(filmUrl(id, "film"), "PUT", sent);
          if (pending.current === sent) {
            pending.current = null;
            seen.current = s.edited;
            setState(s);
          }
        } catch (e) {
          pending.current = null;
          toast((e as Error).message, true);
          refresh();
        }
      }, 600);
    },
    [id, toast, refresh],
  );

  if (!state || !film) return <div className="empty" style={{ margin: 24 }}>Loading…</div>;
  const claudeBusy = state.claude.state === "running";
  const making = claudeBusy && state.claude.action === "make";
  const rendering = state.render.state === "running";
  const index = Math.min(selected, Math.max(0, film.scenes.length - 1));
  const palette = Object.entries(setup.palette ?? {}) as [string, string][];
  const client = clients.find((c) => c.id === state.client) ?? null;

  const set = (f: Partial<Film>) => edit({ ...film, ...f });
  const updateScene = (i: number, s: Partial<Scene>) => edit({ ...film, scenes: film.scenes.map((x, k) => (k === i ? { ...x, ...s } : x)) });
  const seek = (i: number, f = film) => player.current?.seekTo(sceneStart(f, i, 30) + 4);
  const select = (i: number) => {
    setSelected(i);
    setTab("scene");
    seek(i);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= film.scenes.length) return;
    const scenes = [...film.scenes];
    const [s] = scenes.splice(from, 1);
    scenes.splice(to, 0, s);
    edit({ ...film, scenes });
    setSelected(to);
  };
  const remove = (i: number) => {
    edit({ ...film, scenes: film.scenes.filter((_, k) => k !== i) });
    setSelected(Math.max(0, i - 1));
  };
  const duplicate = (i: number) => {
    const scenes = [...film.scenes];
    scenes.splice(i + 1, 0, { ...film.scenes[i], id: newId(film) });
    edit({ ...film, scenes });
    setSelected(i + 1);
  };
  const pick = (template: string) => {
    const meta = SCENES[template]?.meta;
    if (!meta) return;
    if (library === "swap" && film.scenes[index]) {
      // Keep the words of fields that the new template also has.
      const old = film.scenes[index];
      const keys = new Set(meta.fields.map((f) => f.key));
      const props = Object.fromEntries(Object.entries(old.props).filter(([k]) => keys.has(k)));
      updateScene(index, { template, props, duration: Math.max(meta.min, old.duration) });
    } else {
      const at = film.scenes.length ? index + 1 : 0;
      const scenes = [...film.scenes];
      scenes.splice(at, 0, { id: newId(film), template, duration: meta.duration, props: {}, transition: "", accent: "", mode: "", note: "" });
      const next = { ...film, scenes };
      edit(next);
      setSelected(at);
      window.setTimeout(() => seek(at, next), 50);
    }
    setLibrary(null);
    setTab("scene");
  };
  const post = async (path: string, body: unknown = {}) => {
    try {
      setNotice(null);
      show(await sendJSON<FilmState>(filmUrl(id, path), "POST", body));
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const patch = async (body: object, msg?: string) => {
    try {
      show(await sendJSON<FilmState>(filmUrl(id), "PATCH", body));
      onChange();
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const upload = async (role: string, files: FileList | null) => {
    if (!files?.length) return;
    const d = new FormData();
    d.set("role", role);
    for (const f of Array.from(files)) d.append("files", f);
    try {
      show(await api<FilmState>(filmUrl(id, "assets"), { method: "POST", body: d }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const removeAsset = async (name: string) => {
    try {
      show(await api<FilmState>(filmUrl(id, "assets/" + encodeURIComponent(name)), { method: "DELETE" }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const del = async () => {
    if (!confirm(`Delete “${state.title}” and all its files? This can’t be undone.`)) return;
    try {
      await api(filmUrl(id), { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const toggleChat = (open: boolean) => {
    setChat(open);
    try {
      localStorage.setItem("film-chat", open ? "open" : "closed");
    } catch {
      /* only a convenience */
    }
  };

  const changedSince = (t?: number) => !t || (state.edited ?? 0) > t;
  const next = !film.scenes.length
    ? { label: "Make it with Claude", run: () => setTab("claude") }
    : changedSince(state.renders.draft)
      ? { label: state.renders.draft ? "Render new draft" : "Render draft", run: () => post("render", { final: false }) }
      : changedSince(state.renders.final)
        ? { label: "Render final", run: () => post("render", { final: true }) }
        : { label: "Deliver", run: () => setTab("deliver") };
  const task = making ? state.claude : rendering ? state.render : null;
  const elapsed = task?.started ? now / 1000 - task.started : 0;
  const p = task?.progress;
  const seconds = film.scenes.length ? film.scenes.reduce((a, s) => a + s.duration, 0) : 0;
  const problem = [state.claude, state.render].find((t) => t.state === "error" && t.finished && (lastFinish.current ?? 0) <= t.finished);

  return (
    <div className="editor">
      <header className="edbar">
        <button type="button" className="iconbtn" onClick={onBack} title="All films" aria-label="All films">
          ←
        </button>
        <div className="edtitle">
          <input
            className="title-input"
            aria-label="Film title"
            maxLength={80}
            defaultValue={state.title}
            key={state.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== state.title && patch({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <div className="edmeta">
            <select
              className="clientselect"
              value={state.client ?? ""}
              style={{ ["--c" as string]: client?.color ?? "var(--muted)" }}
              onChange={(e) => patch({ client: e.target.value || null }, e.target.value ? "Client set." : undefined)}
              aria-label="Client"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="pill">{FORMAT_NAMES[film.format]}</span>
            <span className="hint">
              {film.scenes.length} scenes · about {clock(seconds)} · {ago(state.created)}
            </span>
          </div>
        </div>
        <div className="edactions">
          {!task ? (
            <button type="button" className="btn" onClick={next.run}>
              {next.label}
            </button>
          ) : null}
          <details className="menu">
            <summary className="iconbtn" aria-label="More">
              ⋯
            </summary>
            <div className="menupop">
              <button type="button" disabled={!state.can_undo || claudeBusy} onClick={() => post("undo")}>
                Undo Claude's last change
              </button>
              {state.renders.final ? <a href={`${filmUrl(id, "files/final.mp4")}?download=true`}>Download final</a> : null}
              {state.renders.draft ? <a href={`${filmUrl(id, "files/draft.mp4")}?download=true`}>Download draft</a> : null}
              <button type="button" className="danger" disabled={claudeBusy || rendering} onClick={del}>
                Delete film
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className={"edbody" + (chat ? " withchat" : "")}>
        <nav className="sections" aria-label="Film sections">
          {SECTIONS.map(([k, icon, label]) => (
            <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              <span className="ico">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className={"chattoggle" + (chat ? " on" : "")} onClick={() => toggleChat(!chat)} title={chat ? "Hide the chat" : "Chat with Claude"}>
            <span className="ico">✎</span>
            <span>Chat</span>
          </button>
        </nav>

        {chat ? <FilmChat id={id} setup={setup} making={making} onFilm={show} toast={toast} onClose={() => toggleChat(false)} /> : null}

        <section className="center">
          {task ? (
            <div className="activity">
              <div className="spinner" />
              <div>
                <b>{ACTION_NAMES[task.action ?? ""] ?? "Working"}</b>
                <p>{task.status}</p>
                <div className={"bar" + (p == null ? " indeterminate" : "")}>
                  <i style={{ width: p == null ? undefined : `${Math.max(2, p * 100)}%` }} />
                </div>
                <small>
                  {clock(elapsed)} elapsed
                  {making ? " · the preview updates as Claude writes · you can leave and come back" : rendering ? " · you can keep editing" : ""}
                </small>
              </div>
              <button type="button" className="btn secondary small" onClick={() => post("cancel", { slot: making ? "claude" : "render" })}>
                Stop
              </button>
            </div>
          ) : null}
          {problem && !task ? (
            <div className="problem">
              <b>{problem.action === "render" ? "The render failed" : "Claude didn't finish"}</b>
              <p>{problem.status.split("\n")[0].slice(0, 300)}</p>
              <details>
                <summary>Technical details</summary>
                <pre>{problem.status}</pre>
              </details>
            </div>
          ) : null}
          {notice ? (
            <div className={"notice" + (notice.error ? " err" : "")}>
              {notice.error ? "!" : "✓"} {notice.msg}
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          ) : null}
          {state.warnings.length ? (
            <details className="warnbox">
              <summary>
                {state.warnings.length} {state.warnings.length === 1 ? "note" : "notes"} on this film
              </summary>
              <ul className="warnings">
                {state.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="seg viewer-tabs">
            <button type="button" className={view === "live" ? "on" : ""} onClick={() => setView("live")}>
              Live film
            </button>
            <button type="button" className={view === "draft" ? "on" : ""} disabled={!state.renders.draft} onClick={() => setView("draft")}>
              Draft{state.renders.draft && changedSince(state.renders.draft) ? " (older)" : ""}
            </button>
            <button type="button" className={view === "final" ? "on" : ""} disabled={!state.renders.final} onClick={() => setView("final")}>
              Final
            </button>
          </div>
          <div className={"viewer filmviewer " + film.format}>
            {view === "live" ? (
              <FilmPreview
                ref={player}
                id={id}
                film={film}
                version={`${state.edited}/${film.sound.music}/${film.sound.voice}/${film.sound.auto}`}
                onFrame={(f) => {
                  setFrame(f);
                }}
              />
            ) : (
              <div className="frame filmframe" style={{ aspectRatio: film.format === "landscape" ? "16 / 9" : film.format === "square" ? "1" : film.format === "feed" ? "4 / 5" : "9 / 16" }}>
                <video key={view} src={`${filmUrl(id, "files/" + view + ".mp4")}?v=${state.renders[view]}`} controls playsInline />
              </div>
            )}
          </div>
          {view === "live" ? (
            <SceneStrip film={film} selected={index} frame={frame} disabled={claudeBusy} onSelect={select} onMove={move} onAdd={() => setLibrary("add")} />
          ) : null}
          <span className="hint viewer-hint">
            {view === "live"
              ? `The film plays live, exactly as it renders. Now in scene ${film.scenes.length ? sceneAt(film, frame, 30) + 1 : 0}. Space to play; drag scenes to reorder.`
              : view === "draft"
                ? "Half-size draft render."
                : "Full-quality final."}
          </span>
        </section>

        <aside className="panel">
          <div style={{ padding: "16px 18px" }}>
            {tab === "claude" ? (
              <MakeTab
                state={state}
                setup={setup}
                busy={claudeBusy}
                make={(request, model) => post("make", { request, model })}
                saveSpec={async (spec) => {
                  try {
                    show(await sendJSON<FilmState>(filmUrl(id, "spec"), "PUT", { spec }));
                    toast("Spec saved.");
                  } catch (e) {
                    toast((e as Error).message, true);
                  }
                }}
                undo={() => post("undo")}
              />
            ) : null}
            {tab === "scene" ? (
              <SceneTab
                film={film}
                index={index}
                palette={palette}
                disabled={claudeBusy}
                update={updateScene}
                remove={remove}
                duplicate={duplicate}
                move={move}
                swap={() => setLibrary("swap")}
                add={() => setLibrary("add")}
              />
            ) : null}
            {tab === "film" ? (
              <FilmTab state={state} film={film} setup={setup} palette={palette} disabled={claudeBusy} set={set} upload={(r, f) => upload(r, f)} removeAsset={removeAsset} toast={toast} />
            ) : null}
            {tab === "deliver" ? <DeliverTab state={state} render={(final) => post("render", { final })} setDelivery={(delivery) => patch({ delivery })} /> : null}
          </div>
        </aside>
      </div>
      {library ? <SceneLibrary film={film} swapping={library === "swap"} onPick={pick} onClose={() => setLibrary(null)} /> : null}
    </div>
  );
};
