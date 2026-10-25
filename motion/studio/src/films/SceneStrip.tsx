import { useState } from "react";
import { timeline } from "../../../src/film/Film";
import { SCENES } from "../../../src/film/registry.gen";
import type { Film } from "./filmApi";

/**
 * The film's scenes in order, sized by their length: click to select and jump there, drag to reorder, ＋ to add.
 * The playhead shows where the preview is.
 */
export const SceneStrip: React.FC<{
  film: Film;
  selected: number;
  frame: number;
  disabled: boolean;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}> = ({ film, selected, frame, disabled, onSelect, onMove, onAdd }) => {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const rows = timeline(film, 30);
  const total = rows.length ? rows[rows.length - 1].from + rows[rows.length - 1].frames : 1;
  return (
    <div className="scenestrip" aria-label="Scenes">
      <div className="scenetrack">
        {rows.map(({ scene, frames, from }, i) => {
          const meta = SCENES[scene.template]?.meta;
          const words = Object.values(scene.props).find((v) => typeof v === "string" && v.trim()) as string | undefined;
          return (
            <button
              key={scene.id}
              type="button"
              draggable={!disabled}
              className={"scenecard" + (i === selected ? " on" : "") + (over === i && drag !== null && drag !== i ? " over" : "") + (frame >= from && frame < from + frames ? " playing" : "")}
              style={{ flexGrow: Math.max(1, frames) }}
              title={`${i + 1}. ${meta?.name ?? scene.template} · ${scene.duration}s${scene.note ? " · " + scene.note : ""}`}
              onClick={() => onSelect(i)}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null && drag !== i) onMove(drag, i);
                setDrag(null);
                setOver(null);
              }}
            >
              <b>
                {i + 1}. {meta?.name ?? scene.template}
              </b>
              <small>{(words ?? meta?.category ?? "").replace(/\*/g, "")}</small>
              <span className="mono">{scene.duration.toFixed(1)}s</span>
            </button>
          );
        })}
        <i className="playhead" style={{ left: `${Math.min(100, (frame / Math.max(1, total)) * 100)}%` }} />
      </div>
      <button type="button" className="sceneadd" onClick={onAdd} disabled={disabled} title="Add a scene">
        ＋
      </button>
    </div>
  );
};
