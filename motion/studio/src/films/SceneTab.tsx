import { SCENES } from "../../../src/film/registry.gen";
import type { FieldValue } from "../../../src/elements/types";
import { ColorRow, FieldInput, Range } from "../steps/EventEditor";
import { TRANSITION_NAMES, type Film, type Scene } from "./filmApi";

/** Words, timing and colour of the selected scene, each change shown live in the preview. */
export const SceneTab: React.FC<{
  film: Film;
  index: number;
  palette: [string, string][];
  disabled: boolean;
  update: (i: number, s: Partial<Scene>) => void;
  remove: (i: number) => void;
  duplicate: (i: number) => void;
  move: (from: number, to: number) => void;
  swap: () => void;
  add: () => void;
}> = ({ film, index, palette, disabled, update, remove, duplicate, move, swap, add }) => {
  const scene = film.scenes[index];
  if (!scene)
    return (
      <div className="section">
        <h3>No scene selected</h3>
        <p className="hint">Pick a scene in the strip under the preview, or add one.</p>
        <button type="button" className="btn small" onClick={add} disabled={disabled}>
          ＋ Add a scene
        </button>
      </div>
    );
  const entry = SCENES[scene.template];
  const meta = entry?.meta;
  const value = (key: string, d: FieldValue) => (scene.props[key] as FieldValue | undefined) ?? d;
  const last = index === film.scenes.length - 1;
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="section">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="hint">Scene {index + 1} of {film.scenes.length}</span>
            <h3 style={{ margin: "2px 0 4px" }}>{meta?.name ?? scene.template}</h3>
          </div>
          <button type="button" className="btn secondary small" onClick={swap}>
            Swap…
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>{meta?.description ?? "This template is missing from the library."}</p>
      </div>
      {meta ? (
        <div className="section" style={{ display: "grid", gap: 12 }}>
          {meta.fields.map((f) => (
            <FieldInput key={f.key} f={f} value={value(f.key, f.default)} palette={palette} onChange={(v) => update(index, { props: { ...scene.props, [f.key]: v } })} />
          ))}
          {meta.fields.some((f) => f.type === "text" || f.type === "longtext") ? (
            <p className="hint" style={{ margin: 0 }}>
              Put a word in *stars* to show it in the accent. Lists take one row per line; parts of a row are split by |.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="section" style={{ display: "grid", gap: 12 }}>
        <Range label="Length" value={scene.duration} min={meta?.min ?? 1} max={15} step={0.1} show={(v) => v.toFixed(1) + " s"} onChange={(duration) => update(index, { duration })} />
        {!last ? (
          <label className="field">
            <span>Into the next scene</span>
            <select value={scene.transition ?? ""} onChange={(e) => update(index, { transition: e.target.value as Scene["transition"] })} disabled={film.camera === "world"}>
              <option value="">Film's transition ({TRANSITION_NAMES[film.transition]})</option>
              {Object.entries(TRANSITION_NAMES).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {film.camera === "world" && !last ? <span className="hint">The 3D camera flies between scenes, so transitions are not used.</span> : null}
        <ColorRow label="Accent" value={scene.accent ?? ""} empty="" palette={palette} onChange={(accent) => update(index, { accent })} />
        <div className="row">
          <span className="hint" style={{ width: 92 }}>Surfaces</span>
          <div className="seg">
            {(["", "dark", "light"] as const).map((m) => (
              <button key={m} type="button" className={(scene.mode ?? "") === m ? "on" : ""} onClick={() => update(index, { mode: m })}>
                {m === "" ? "Film's" : m === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Note (what this scene is for; not shown)</span>
          <input value={scene.note ?? ""} onChange={(e) => update(index, { note: e.target.value })} />
        </label>
      </div>
      <div className="section row" style={{ flexWrap: "wrap", gap: 6 }}>
        <button type="button" className="btn secondary small" onClick={() => move(index, index - 1)} disabled={index === 0}>
          ↑ Earlier
        </button>
        <button type="button" className="btn secondary small" onClick={() => move(index, index + 1)} disabled={last}>
          ↓ Later
        </button>
        <button type="button" className="btn secondary small" onClick={() => duplicate(index)}>
          Duplicate
        </button>
        <button type="button" className="btn ghost small" style={{ color: "var(--danger)" }} onClick={() => remove(index)}>
          Delete scene
        </button>
      </div>
    </fieldset>
  );
};
