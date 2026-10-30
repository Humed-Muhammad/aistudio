import { useEffect, useState } from "react";
import { api, sendJSON } from "../api";
import type { ChannelSetup, Profile } from "./channelApi";
import { VoicePicker } from "./VoicePicker";
import { ArtPanel } from "./ArtPanel";

/** Channel profiles: who the channel is for and how it sounds and looks. Every video starts from one. */
export const Profiles: React.FC<{
  setup: ChannelSetup | null;
  profiles: Profile[];
  reload: () => void;
}> = ({ setup, profiles, reload }) => {
  const [open, setOpen] = useState<string | null>(profiles[0]?.id ?? null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (open === "new" && setup) setDraft({ ...structuredClone(setup.defaults), id: "", name: "" });
    else setDraft(structuredClone(profiles.find((p) => p.id === open) ?? null));
    setSaved(false);
  }, [open, profiles, setup]);
  useEffect(() => {
    if (!open && profiles.length) setOpen(profiles[0].id);
  }, [open, profiles]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => (setDraft((d) => (d ? { ...d, [k]: v } : d)), setSaved(false));
  const save = async () => {
    if (!draft) return;
    setError("");
    try {
      const p = draft.id ? await sendJSON<Profile>(`/channel/profiles/${draft.id}`, "PUT", draft) : await sendJSON<Profile>("/channel/profiles", "POST", draft);
      reload();
      setOpen(p.id);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!draft?.id || !confirm(`Delete the channel “${draft.name}”? Its videos stay.`)) return;
    await api(`/channel/profiles/${draft.id}`, { method: "DELETE" }).catch(() => {});
    setOpen(null);
    reload();
  };

  return (
    <div className="page">
      <header className="pagehead">
        <div>
          <h1>Channels</h1>
          <p className="hint">Who each channel is for, its voice and its look. Claude reads the profile before every script.</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen("new")}>
          ＋ New channel
        </button>
      </header>
      <div className="clientsplit">
        <div className="videolist">
          {profiles.map((p) => (
            <button key={p.id} type="button" className={"vrow" + (open === p.id ? " on" : "")} onClick={() => setOpen(p.id)}>
              <span className="avatar" style={{ background: p.look.accent }}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="vtitle">
                <b>{p.name}</b>
                <span className="hint">{p.niche || "No niche yet"}</span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
          {!profiles.length ? <div className="empty">No channels yet. Research a niche first, or make one now.</div> : null}
        </div>
        {draft ? (
          <div className="card" style={{ display: "grid", gap: 14 }}>
            <div className="grid">
              <label className="field">
                <span>Channel name</span>
                <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Cosmos in 10" />
              </label>
              <label className="field">
                <span>Niche</span>
                <input value={draft.niche} onChange={(e) => set("niche", e.target.value)} placeholder="space and astronomy explained" />
              </label>
            </div>
            <label className="field">
              <span>Audience</span>
              <input value={draft.audience} onChange={(e) => set("audience", e.target.value)} placeholder="curious adults 18-40, no science background" />
            </label>
            <label className="field">
              <span>Tone of the narration</span>
              <input value={draft.tone} onChange={(e) => set("tone", e.target.value)} />
            </label>
            <label className="field">
              <span>Notes for Claude (style, words to avoid, recurring segments)</span>
              <textarea rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>
            <VoicePicker value={draft.voice} onChange={(voice) => set("voice", voice)} available={!!setup?.keys.elevenlabs} />
            <ArtPanel draft={draft} set={set} setup={setup} reload={reload} />
            <div className="grid">
              <label className="field">
                <span>Usual length</span>
                <select value={draft.minutes} onChange={(e) => set("minutes", +e.target.value)}>
                  {[3, 5, 8, 10, 12, 15, 20].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" title="The most fal.ai may charge for AI images and clips in one video. 0 = never use paid AI visuals.">
                <span>AI visuals budget per video ($)</span>
                <input type="number" min={0} max={100} step={0.5} value={draft.ai_budget} onChange={(e) => set("ai_budget", +e.target.value)} />
              </label>
            </div>
            <div className="grid">
              <label className="field">
                <span>Upload as</span>
                <select
                  value={draft.upload.privacy}
                  onChange={(e) =>
                    set("upload", {
                      ...draft.upload,
                      privacy: e.target.value as Profile["upload"]["privacy"],
                    })
                  }
                >
                  <option value="private">Private (you publish it)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="field">
                <span>Default tags (comma separated)</span>
                <input
                  value={draft.upload.tags.join(", ")}
                  onChange={(e) =>
                    set("upload", {
                      ...draft.upload,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
            {error ? <div className="notice err">{error}</div> : null}
            <div className="row">
              <button type="button" className="btn" onClick={save} disabled={!draft.name.trim()}>
                {draft.id ? "Save" : "Create channel"}
              </button>
              {saved ? <span className="hint">Saved.</span> : null}
              {draft.id ? (
                <button type="button" className="btn ghost small" style={{ marginLeft: "auto" }} onClick={remove}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
