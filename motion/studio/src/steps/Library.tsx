import { Player, type PlayerRef } from "@remotion/player";
import { useMemo, useRef, useState } from "react";
import { ElementPreview } from "../../../src/elements/Preview";
import { ELEMENTS } from "../../../src/elements/registry.gen";
import type { ElementMeta } from "../../../src/elements/types";

/** One library graphic: shows its poster moment, plays while hovered, adds on click. */
const Tile: React.FC<{
  meta: ElementMeta;
  style?: string;
  accent: string;
  disabled: boolean;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}> = ({ meta, style, accent, disabled, count, onAdd, onRemove }) => {
  const ref = useRef<PlayerRef>(null);
  const frames = Math.max(1, Math.round(meta.duration * 30));
  const poster = Math.min(
    frames - 1,
    Math.round(frames * (meta.poster ?? 0.55)),
  );
  const props = useMemo(
    () => ({ id: meta.id, style, accent, centred: true }),
    [meta.id, style, accent],
  );
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
        <button
          type="button"
          className="libused"
          disabled={disabled}
          title="Remove it from this video (the one nearest the preview)"
          onClick={onRemove}
        >
          In video{count > 1 ? ` ×${count}` : ""} · Remove
        </button>
      ) : null}
    </div>
  );
};

/** The graphics library: every graphic in motion/src/elements, by category, ready to add at the playhead. */
export const Library: React.FC<{
  style?: string;
  accent: string;
  disabled: boolean;
  /** How many times each graphic is in this video. */
  used: Record<string, number>;
  onAdd: (meta: ElementMeta) => void;
  onRemove: (id: string) => void;
}> = ({ style, accent, disabled, used, onAdd, onRemove }) => {
  const all = useMemo(
    () =>
      Object.values(ELEMENTS).map((e) => ({
        ...e.meta,
        mine: e.source === "mine",
      })),
    [],
  );
  const categories = useMemo(
    () => ["All", ...new Set(all.map((m) => m.category))],
    [all],
  );
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const shown = all.filter(
    (m) =>
      (category === "All" || m.category === category) &&
      (!query ||
        `${m.name} ${m.description}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <div className="section" id="library" style={{ marginTop: 16 }}>
      <h3>
        Graphics library <span className="hint">· {all.length}</span>
      </h3>
      <p className="hint" style={{ marginTop: -4 }}>
        Hover to play, click to add where the preview is paused. Graphics
        already in this video say so; remove them there or with × in the list
        above. Everything takes your graphic style and accent colour, and every
        word is editable.
      </p>
      <div
        className="row"
        style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={"chip" + (category === c ? " on" : "")}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <input
          className="libsearch"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search graphics"
        />
      </div>
      <div className="libgrid">
        {shown.map((m) => (
          <Tile
            key={m.id}
            meta={m}
            style={style}
            accent={accent}
            disabled={disabled}
            count={used[m.id] ?? 0}
            onAdd={() => onAdd(m)}
            onRemove={() => onRemove(m.id)}
          />
        ))}
        {!shown.length ? <div className="empty">No graphics match.</div> : null}
      </div>
    </div>
  );
};
