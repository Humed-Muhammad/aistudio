import { Sounds } from "../steps/Sounds";
import { ColorRow, Range } from "../steps/EventEditor";
import { fileUrl } from "../api";
import { BACKDROP_NAMES, CAMERA_NAMES, FORMAT_NAMES, STYLE_NAMES, TRANSITION_NAMES, type Film, type FilmSetup, type FilmState } from "./filmApi";

const SAMPLE: Record<string, [string, string]> = { glass: ["Paid", "faster"], bold: ["PAID", "FASTER"], editorial: ["Paid", "faster"], minimal: ["Paid", "faster"], tech: ["Paid", "faster"], brutal: ["Paid", "faster"], aurora: ["Paid", "faster"], candy: ["Paid", "faster"], noir: ["Paid", "faster"], swiss: ["PAID", "FASTER"], clay: ["Paid", "faster"] };

/** The whole film's look and sound: format, graphic style, colours, backdrop, transitions, camera, brand, music and voice. */
export const FilmTab: React.FC<{
  state: FilmState;
  film: Film;
  setup: FilmSetup;
  palette: [string, string][];
  disabled: boolean;
  set: (f: Partial<Film>) => void;
  upload: (role: "logo" | "music" | "voice" | "image", files: FileList | null) => void;
  removeAsset: (name: string) => void;
  toast: (msg: string, error?: boolean) => void;
}> = ({ state, film, setup, palette, disabled, set, upload, removeAsset, toast }) => {
  const file = (role: "logo" | "music" | "voice", accept: string, label: string, current: string) => (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <span className="hint" style={{ width: 92 }}>{label}</span>
      {current ? (
        <>
          <span className="mono" style={{ fontSize: 12 }}>{current.replace("assets/", "")}</span>
          <button type="button" className="btn ghost small" onClick={() => removeAsset(current.replace("assets/", ""))}>
            Remove
          </button>
        </>
      ) : null}
      <label className="btn secondary small">
        {current ? "Replace" : "Add…"}
        <input type="file" accept={accept} hidden onChange={(e) => upload(role, e.target.files)} />
      </label>
    </div>
  );
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="section">
        <h3>Format</h3>
        <div className="formats">
          {(Object.keys(FORMAT_NAMES) as Film["format"][]).map((f) => {
            const [w, h] = setup.formats[f] ?? [1080, 1920];
            return (
              <button key={f} type="button" className={"formatpick" + (film.format === f ? " on" : "")} onClick={() => set({ format: f })}>
                <i style={{ aspectRatio: `${w} / ${h}` }} />
                {FORMAT_NAMES[f]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="section">
        <h3>Graphic style</h3>
        <div className="templates" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))" }}>
          {setup.styles.map((id) => (
            <button key={id} type="button" className={"tpl" + (film.style === id ? " on" : "")} onClick={() => set({ style: id })}>
              <span className={"gsample gs-" + id}>
                <b>{SAMPLE[id]?.[0]}</b>
                <i>{SAMPLE[id]?.[1]}</i>
              </span>
              {STYLE_NAMES[id] ?? id}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="hint" style={{ width: 92 }}>Surfaces</span>
          <div className="seg">
            {(["dark", "light"] as const).map((m) => (
              <button key={m} type="button" className={film.mode === m ? "on" : ""} onClick={() => set({ mode: m })}>
                {m === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="section" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Colours</h3>
        <ColorRow label="Accent" value={film.accent} empty="#6EC1FF" palette={palette} onChange={(accent) => set({ accent: accent || "#6EC1FF" })} />
        <ColorRow label="Second" value={film.accent2} empty="#B79CFF" palette={palette} onChange={(accent2) => set({ accent2: accent2 || "#B79CFF" })} />
      </div>
      <div className="section">
        <h3>Backdrop</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {setup.backdrops.map((b) => (
            <button key={b} type="button" className={"chip" + (film.backdrop === b ? " on" : "")} onClick={() => set({ backdrop: b as Film["backdrop"] })}>
              {BACKDROP_NAMES[b] ?? b}
            </button>
          ))}
        </div>
      </div>
      <div className="section">
        <h3>Camera</h3>
        <div className="templates">
          {setup.cameras.map((c) => (
            <button key={c} type="button" className={"tpl" + (film.camera === c ? " on" : "")} onClick={() => set({ camera: c as Film["camera"] })}>
              {CAMERA_NAMES[c]?.[0] ?? c}
              <small>{CAMERA_NAMES[c]?.[1]}</small>
            </button>
          ))}
        </div>
      </div>
      {film.camera !== "world" ? (
        <div className="section">
          <h3>Transition between scenes</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {setup.transitions.map((t) => (
              <button key={t} type="button" className={"chip" + (film.transition === t ? " on" : "")} onClick={() => set({ transition: t as Film["transition"] })}>
                {TRANSITION_NAMES[t] ?? t}
              </button>
            ))}
          </div>
          <p className="hint">Each scene can use its own (Scene section).</p>
        </div>
      ) : null}
      <div className="section" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Brand</h3>
        <label className="field">
          <span>Name</span>
          <input value={film.brand.name} maxLength={40} onChange={(e) => set({ brand: { ...film.brand, name: e.target.value } })} />
        </label>
        {file("logo", "image/png,image/jpeg,image/webp,image/svg+xml", "Logo", film.brand.logo)}
        {film.brand.logo ? <img src={fileUrl("films/" + state.id, film.brand.logo)} alt="Logo" style={{ maxHeight: 56, maxWidth: 160, objectFit: "contain" }} /> : <span className="hint">Without a logo, the first letter is drawn on an accent tile.</span>}
        <label className="field">
          <span>On-screen language</span>
          <select value={film.language} onChange={(e) => set({ language: e.target.value as Film["language"] })}>
            <option value="en">English</option>
            <option value="am">Amharic (Ethiopic script)</option>
            <option value="om">Afaan Oromoo</option>
          </select>
        </label>
      </div>
      <div className="section" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Sound</h3>
        <label className="check">
          <input type="checkbox" checked={film.sound.auto} onChange={(e) => set({ sound: { ...film.sound, auto: e.target.checked } })} />
          Sound effects on the motion (whooshes, pops, clicks), levelled automatically
        </label>
        {file("music", "audio/*", "Music", film.sound.music)}
        {film.sound.music ? <Range label="Music volume" value={film.sound.music_volume} min={0} max={1} step={0.05} show={(v) => Math.round(v * 100) + "%"} onChange={(music_volume) => set({ sound: { ...film.sound, music_volume } })} /> : null}
        {file("voice", "audio/*", "Voice-over", film.sound.voice)}
        <span className="hint">Your own voice plays exactly as recorded. Music sits lower under it.</span>
        <details>
          <summary>Pick the sound effects</summary>
          <Sounds busy={disabled} toast={toast} />
        </details>
      </div>
    </fieldset>
  );
};
