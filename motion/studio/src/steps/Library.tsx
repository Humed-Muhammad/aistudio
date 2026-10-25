import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ElementPreview } from "../../../src/elements/Preview";
import { ELEMENTS } from "../../../src/elements/registry.gen";
import type { ElementMeta } from "../../../src/elements/types";
import { api, clock, sendJSON } from "../api";

/** What the server says about the library: Claude's current task, your own graphics, hidden ones, undo steps. */
type LibraryState = {
  state: "idle" | "running" | "done" | "error" | "cancelled";
  status: string;
  action?: "make" | "change";
  target?: string;
  graphic?: string;
  started?: number;
  finished?: number;
  hidden: string[];
  mine: string[];
  undo: Record<string, number>;
  claude: boolean;
  models: Record<string, string>;
};

/** One library graphic: shows its poster moment, plays while hovered, adds on click. */
const Tile: React.FC<{
  meta: ElementMeta;
  style?: string;
  accent: string;
  disabled: boolean;
  count: number;
  children?: React.ReactNode;
  onAdd: () => void;
  onRemove: () => void;
}> = ({ meta, style, accent, disabled, count, children, onAdd, onRemove }) => {
  const ref = useRef<PlayerRef>(null);
  const frames = Math.max(1, Math.round(meta.duration * 30));
  const poster = Math.min(frames - 1, Math.round(frames * (meta.poster ?? 0.55)));
  const props = useMemo(() => ({ id: meta.id, style, accent, centred: true }), [meta.id, style, accent]);
  return (
    <div className="libwrap">
      <button
        type="button"
        className={"libtile" + (count ? " used" : "")}
        title={meta.description}
        disabled={disabled}
        onClick={onAdd}
        onMouseEnter={() => {
          ref.current?.seekTo(0);
          ref.current?.play();
        }}
        onMouseLeave={() => {
          ref.current?.pause();
          ref.current?.seekTo(poster);
        }}
      >
        <span className="libthumb">
          <Player
            ref={ref}
            component={ElementPreview}
            inputProps={props}
            durationInFrames={frames}
            fps={30}
            compositionWidth={1080}
            compositionHeight={1080}
            initialFrame={poster}
            loop
            style={{ width: "100%", height: "100%" }}
            acknowledgeRemotionLicense
          />
        </span>
        <span className="libname">{meta.name}</span>
      </button>
      {count ? (
        <button type="button" className="libused" disabled={disabled} title="Remove it from this video (the one nearest the preview)" onClick={onRemove}>
          In video{count > 1 ? ` ×${count}` : ""} · Remove
        </button>
      ) : null}
      <div className="libacts">{children}</div>
    </div>
  );
};

/**
 * The graphics library: every graphic in motion/src/elements, by category, ready to add at the playhead.
 * "Describe a graphic" asks Claude Code to make a new one; Change, Undo, Delete and Hide manage them.
 */
export const Library: React.FC<{
  style?: string;
  accent: string;
  disabled: boolean;
  /** How many times each graphic is in this video. */
  used: Record<string, number>;
  /** Set while a planned graphic waits to be swapped: what it is, for the banner. */
  swapping?: string;
  onCancelSwap: () => void;
  onAdd: (meta: ElementMeta) => void;
  onRemove: (id: string) => void;
  toast: (msg: string, error?: boolean) => void;
}> = ({ style, accent, disabled, used, swapping, onCancelSwap, onAdd, onRemove, toast }) => {
  const all = useMemo(() => Object.values(ELEMENTS).map((e) => ({ ...e.meta, source: e.source })), []);
  const categories = useMemo(() => ["All", "Mine", ...new Set(all.map((m) => m.category))], [all]);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [lib, setLib] = useState<LibraryState | null>(null);
  const [describe, setDescribe] = useState("");
  const [model, setModel] = useState("sonnet");
  const [changing, setChanging] = useState<{ id: string; name: string; text: string } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [now, setNow] = useState(Date.now());
  const poll = useRef<number>(undefined);

  const load = useCallback(async () => {
    window.clearTimeout(poll.current);
    try {
      const s = await api<LibraryState>("/shorts/library");
      setLib(s);
      if (s.state === "running") poll.current = window.setTimeout(load, 1500);
    } catch {
      poll.current = window.setTimeout(load, 5000);
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(poll.current);
      window.clearInterval(t);
    };
  }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    try {
      setLib(await sendJSON<LibraryState>(url, method, body ?? {}));
      load();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    }
  };
  const make = async () => {
    if (describe.trim().length < 8) return toast("Describe the graphic in a sentence or two.", true);
    if (await send("/shorts/library/make", "POST", { description: describe, model })) setDescribe("");
  };
  const change = async () => {
    if (!changing || changing.text.trim().length < 4) return toast("Say what to change in a few words.", true);
    if (await send(`/shorts/library/${changing.id}/change`, "POST", { request: changing.text, model })) setChanging(null);
  };
  const undo = (id: string) => send(`/shorts/library/${id}/undo`, "POST").then((ok) => ok && toast("Back to the earlier version. Reload to see it.", false));
  const remove = (m: ElementMeta) => {
    if (!window.confirm(`Delete “${m.name}” from your library? It stays in this video's plan until you remove it there.`)) return;
    send(`/shorts/library/${m.id}`, "DELETE").then((ok) => ok && toast("Deleted. Reload to update the library.", false));
  };
  const hide = (id: string, hidden: boolean) => send(`/shorts/library/${id}/hide`, "POST", { hidden });

  const running = lib?.state === "running";
  const hiddenSet = new Set(lib?.hidden ?? []);
  // A graphic finished after this page loaded: the studio was rebuilt, so a reload shows it.
  const fresh = lib?.state === "done" && lib.graphic && !ELEMENTS[lib.graphic];
  const shown = all.filter(
    (m) =>
      (showHidden || !hiddenSet.has(m.id)) &&
      (category === "All" || (category === "Mine" ? m.source === "mine" : m.category === category)) &&
      (!query || `${m.name} ${m.description}`.toLowerCase().includes(query.toLowerCase())),
  );
  const elapsed = lib?.started ? clock(Math.max(0, now / 1000 - lib.started)) : "";

  return (
    <div className="section" id="library" style={{ marginTop: 16 }}>
      <h3>
        Graphics library <span className="hint">· {all.length - hiddenSet.size}</span>
      </h3>

      <div className="libmake">
        <label className="field">
          <span>✨ Describe a graphic and Claude makes it</span>
          <textarea
            dir="auto"
            rows={2}
            value={describe}
            disabled={running}
            onChange={(e) => setDescribe(e.target.value)}
            placeholder="e.g. A phone that slides in and shows a 5-star review card with the customer's name. Or: a neon OPEN sign that flickers on."
          />
        </label>
        <div className="row">
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: "auto" }} aria-label="Claude model">
            {Object.entries(lib?.models ?? { sonnet: "Sonnet · balanced" }).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" disabled={running || !lib?.claude} onClick={make}>
            Make it
          </button>
        </div>
        <span className="hint">
          {lib && !lib.claude ? "Claude Code is not installed: see the README." : "Uses your Claude plan · about 2–6 minutes · it checks a rendered frame before adding it."}
        </span>
        {changing ? (
          <div className="libchange">
            <label className="field">
              <span>Change “{changing.name}”{ELEMENTS[changing.id]?.source === "pack" ? " (your own copy is made; the original stays)" : ""}</span>
              <textarea dir="auto" rows={2} autoFocus value={changing.text} onChange={(e) => setChanging({ ...changing, text: e.target.value })} placeholder="e.g. Bigger text, slower entrance, add a subtitle line, use a round badge instead." />
            </label>
            <div className="row">
              <button type="button" className="btn small" disabled={running} onClick={change}>
                Make this change
              </button>
              <button type="button" className="btn secondary small" onClick={() => setChanging(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {lib && lib.state !== "idle" ? (
          <div className={"libstatus " + lib.state}>
            {running ? <span className="spinner small" /> : null}
            <span style={{ flex: 1 }}>
              {lib.state === "done" && lib.graphic && ELEMENTS[lib.graphic] ? `Ready: ${ELEMENTS[lib.graphic].meta.name} (under Mine)` : lib.status}
              {running && elapsed ? <span className="hint"> · {elapsed}</span> : null}
            </span>
            {running ? (
              <button type="button" className="btn ghost small" onClick={() => send("/shorts/library/cancel", "POST")}>
                Cancel
              </button>
            ) : fresh ? (
              <button type="button" className="btn small" onClick={() => location.reload()}>
                Show it
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="hint" style={{ margin: "12px 0 8px" }}>
        Hover to play, click to add where the preview is paused. Everything takes your graphic style and accent colour, and every word is editable.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {categories.map((c) => (
          <button key={c} type="button" className={"chip" + (category === c ? " on" : "")} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
        {hiddenSet.size ? (
          <button type="button" className={"chip" + (showHidden ? " on" : "")} onClick={() => setShowHidden(!showHidden)}>
            Hidden ({hiddenSet.size})
          </button>
        ) : null}
        <input className="libsearch" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search graphics" />
      </div>
      {swapping ? (
        <div className="libstatus swap">
          <span style={{ flex: 1 }}>
            Swapping <b>{swapping}</b>. Click a graphic to put it in its place: same time, position and size, your words kept where they fit.
          </span>
          <button type="button" className="btn ghost small" onClick={onCancelSwap}>
            Cancel
          </button>
        </div>
      ) : null}
      <div className={"libgrid" + (swapping ? " swapping" : "")}>
        {shown.map((m) => {
          const mine = m.source === "mine";
          return (
            <Tile key={m.id} meta={m} style={style} accent={accent} disabled={disabled} count={used[m.id] ?? 0} onAdd={() => onAdd(m)} onRemove={() => onRemove(m.id)}>
              <button type="button" disabled={running} title="Describe a change; Claude makes it" onClick={() => setChanging({ id: m.id, name: m.name, text: "" })}>
                Change
              </button>
              {mine && (lib?.undo[m.id] ?? 0) > 0 ? (
                <button type="button" disabled={running} title="Go back to the version before the last change" onClick={() => undo(m.id)}>
                  Undo
                </button>
              ) : null}
              {mine ? (
                <button type="button" disabled={running} onClick={() => remove(m)}>
                  Delete
                </button>
              ) : (
                <button type="button" onClick={() => hide(m.id, !hiddenSet.has(m.id))}>
                  {hiddenSet.has(m.id) ? "Show" : "Hide"}
                </button>
              )}
            </Tile>
          );
        })}
        {!shown.length ? <div className="empty">{category === "Mine" ? "Nothing yet: describe a graphic above." : "No graphics match."}</div> : null}
      </div>
    </div>
  );
};
