import { Player, type PlayerRef } from "@remotion/player";
import { useMemo, useRef, useState } from "react";
import { ScenePreview } from "../../../src/film/Preview";
import { SCENES } from "../../../src/film/registry.gen";
import { SIZES } from "../../../src/film/types";
import type { Film, SceneMeta } from "./filmApi";

/** One scene template: its poster moment in this film's style; plays while hovered. */
const Tile: React.FC<{ meta: SceneMeta; film: Film; onPick: () => void }> = ({ meta, film, onPick }) => {
  const ref = useRef<PlayerRef>(null);
  const frames = Math.round(meta.duration * 30);
  const poster = Math.min(frames - 1, Math.round(frames * (meta.poster ?? 0.7)));
  const [w, h] = SIZES[film.format];
  const props = useMemo(
    () => ({ id: meta.id, film: { format: film.format, style: film.style, mode: film.mode, accent: film.accent, accent2: film.accent2, backdrop: film.backdrop, brand: film.brand } }),
    [meta.id, film.format, film.style, film.mode, film.accent, film.accent2, film.backdrop, film.brand],
  );
  return (
    <button
      type="button"
      className="libtile scenetile"
      title={meta.description}
      onClick={onPick}
      onMouseEnter={() => {
        ref.current?.seekTo(0);
        ref.current?.play();
      }}
      onMouseLeave={() => {
        ref.current?.pause();
        ref.current?.seekTo(poster);
      }}
    >
      <span className="libthumb" style={{ aspectRatio: `${w} / ${h}` }}>
        <Player
          ref={ref}
          component={ScenePreview}
          inputProps={props}
          durationInFrames={frames}
          fps={30}
          compositionWidth={w}
          compositionHeight={h}
          initialFrame={poster}
          loop
          style={{ width: "100%", height: "100%" }}
          acknowledgeRemotionLicense
        />
      </span>
      <span className="libname">{meta.name}</span>
      <small className="hint">{meta.description}</small>
    </button>
  );
};

/** Every scene template, by category, previewed in this film's look. Picking one adds it (or swaps the selected scene). */
export const SceneLibrary: React.FC<{ film: Film; swapping: boolean; onPick: (id: string) => void; onClose: () => void }> = ({ film, swapping, onPick, onClose }) => {
  const all = useMemo(() => Object.values(SCENES).map((e) => e.meta), []);
  const categories = useMemo(() => ["All", ...new Set(all.map((m) => m.category))], [all]);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = all.filter((m) => (category === "All" || m.category === category) && (!q || (m.name + " " + m.description).toLowerCase().includes(q)));
  return (
    <div className="modal" role="dialog" aria-label="Scene library" onClick={onClose}>
      <div className="modalbox" onClick={(e) => e.stopPropagation()}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>{swapping ? "Swap this scene for…" : "Add a scene"}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Every scene is drawn in code in your film's style. Hover to play. {swapping ? "Words in fields with the same name are kept." : "It goes after the selected scene."}
            </p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
          <input className="libsearch" placeholder="Search scenes…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 220 }} />
          {categories.map((c) => (
            <button key={c} type="button" className={"chip" + (category === c ? " on" : "")} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className={"libgrid scenegrid" + (film.format === "landscape" ? " wide" : "")}>
          {shown.map((m) => (
            <Tile key={m.id} meta={m} film={film} onPick={() => onPick(m.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};
