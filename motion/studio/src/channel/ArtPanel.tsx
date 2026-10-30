import { useEffect, useState } from "react";
import { api, sendJSON } from "../api";
import type { ChannelSetup, MascotState, Profile } from "./channelApi";

const ART: Record<string, [string, string]> = {
  flat: ["Flat illustrated", "Clean vector scenes, soft pastels: the classic animated explainer"],
  doodle: ["Hand-drawn doodle", "Marker lines on paper, playful"],
  "3d": ["3D cartoon", "Rounded, toy-like 3D, soft light"],
  comic: ["Comic", "Ink outlines, flat bold colour, halftone"],
  realistic: ["Realistic", "Photo-like images and real stock footage"],
};

/** How the channel looks: the art style every illustration is drawn in, the mascot, the code-drawn graphics and the music bed. */
export const ArtPanel: React.FC<{
  draft: Profile;
  set: <K extends keyof Profile>(k: K, v: Profile[K]) => void;
  setup: ChannelSetup | null;
  reload: () => void;
}> = ({ draft, set, setup, reload }) => {
  const [mascot, setMascot] = useState<MascotState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const saved = !!draft.id;
  useEffect(() => {
    if (saved) api<MascotState>(`/channel/profiles/${draft.id}/mascot`).then(setMascot, () => setMascot(null));
  }, [draft.id, saved]);
  const art = draft.art;
  const setArt = (a: Partial<Profile["art"]>) => set("art", { ...art, ...a });
  const price = (setup?.prices.image ?? 0.04) * 4;
  const design = async () => {
    setBusy("design");
    setError("");
    try {
      setMascot(await sendJSON<MascotState>(`/channel/profiles/${draft.id}/mascot/design`, "POST", { description: art.mascot.description, usd: price }));
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const pick = async (option: string) => {
    setError("");
    try {
      setMascot(await sendJSON<MascotState>(`/channel/profiles/${draft.id}/mascot/pick`, "POST", { option: option.split("/").pop() }));
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const upload = async (file: File | undefined, path: "mascot/upload" | "music") => {
    if (!file) return;
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      const got = await api<MascotState | Profile>(`/channel/profiles/${draft.id}/${path}`, { method: "POST", body: form });
      if ("options" in got) setMascot(got);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="section" style={{ display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0 }}>Look</h3>
      <div className="artstyles">
        {Object.entries(ART).map(([k, [name, hint]]) => (
          <button
            key={k}
            type="button"
            className={"chip" + (art.style === k ? " on" : "")}
            onClick={() => setArt({ style: k, stock: k === "realistic" ? true : art.stock })}
            title={hint}
          >
            {name}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Style words added to every illustration (leave empty for the style above)</span>
        <textarea rows={2} value={art.prompt} placeholder={setup?.art_styles[art.style] ?? ""} onChange={(e) => setArt({ prompt: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={art.stock} onChange={(e) => setArt({ stock: e.target.checked })} /> Mix in real stock footage (Pexels, Pixabay)
      </label>

      <div className="mascotbox">
        <div>
          <b>Mascot</b>
          <p className="hint" style={{ margin: "2px 0 8px" }}>
            One character that appears in about a third of the illustrations, looking the same every time: Claude decides where; the image model keeps it from this picture.
          </p>
          <div className="grid">
            <label className="field">
              <span>Name</span>
              <input value={art.mascot.name} onChange={(e) => setArt({ mascot: { ...art.mascot, name: e.target.value } })} placeholder="Pip" />
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            <span>What it looks like</span>
            <textarea
              rows={2}
              value={art.mascot.description}
              onChange={(e) =>
                setArt({
                  mascot: { ...art.mascot, description: e.target.value },
                })
              }
              placeholder="a small round orange robot with big curious eyes, a single antenna and stubby arms"
            />
          </label>
          {!saved ? (
            <p className="hint">Create the channel first, then design its mascot.</p>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn small" disabled={!!busy || !setup?.keys.fal || art.mascot.description.trim().length < 8} onClick={design}>
                {busy === "design" ? "Designing… (about 30 s)" : `Design 4 options · about $${price.toFixed(2)}`}
              </button>
              <label className="btn secondary small">
                Upload my own
                <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "mascot/upload")} />
              </label>
              {!setup?.keys.fal ? <span className="hint">Add FAL_KEY to .env to design one here.</span> : null}
            </div>
          )}
        </div>
        <div className="mascotnow">{mascot?.image ? <img src={mascot.image} alt="The mascot" /> : <span className="hint">No mascot yet</span>}</div>
      </div>
      {mascot?.options.length ? (
        <div className="mascotoptions">
          {mascot.options.map((o) => (
            <button key={o} type="button" onClick={() => pick(o)} title="Use this one">
              <img src={o} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid">
        <label className="field">
          <span>Graphics style (numbers, lists, chapter cards)</span>
          <select value={draft.look.style} onChange={(e) => set("look", { ...draft.look, style: e.target.value })}>
            {(setup?.styles ?? ["cartoon"]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Background</span>
          <select value={draft.look.backdrop} onChange={(e) => set("look", { ...draft.look, backdrop: e.target.value })}>
            {(setup?.backdrops ?? ["cartoon"]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Light or dark</span>
          <select
            value={draft.look.mode}
            onChange={(e) =>
              set("look", {
                ...draft.look,
                mode: e.target.value as "dark" | "light",
              })
            }
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          <span>Colours</span>
          <span className="row">
            <input
              type="color"
              value={draft.look.accent}
              onChange={(e) =>
                set("look", {
                  ...draft.look,
                  accent: e.target.value.toUpperCase(),
                })
              }
            />
            <input
              type="color"
              value={draft.look.accent2}
              onChange={(e) =>
                set("look", {
                  ...draft.look,
                  accent2: e.target.value.toUpperCase(),
                })
              }
            />
          </span>
        </label>
      </div>
      {saved ? (
        <div className="row">
          <span className="hint">Music bed: {draft.look.music ? draft.look.music.replace(/^[0-9a-f]+-/, "") : "none"}</span>
          <label className="btn secondary small">
            {draft.look.music ? "Replace music" : "Add music"}
            <input type="file" accept="audio/*" hidden onChange={(e) => upload(e.target.files?.[0], "music")} />
          </label>
          <label className="field" style={{ width: 160 }}>
            <span>Music volume</span>
            <input type="range" min={0} max={0.4} step={0.02} value={draft.look.music_volume} onChange={(e) => set("look", { ...draft.look, music_volume: +e.target.value })} />
          </label>
          <span className="hint">Royalty-free only (e.g. the YouTube Audio Library).</span>
        </div>
      ) : null}
      {error ? <div className="notice err">{error}</div> : null}
    </div>
  );
};
