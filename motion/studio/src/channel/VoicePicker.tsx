import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Profile } from "./channelApi";

type Voice = {
  id: string;
  name: string;
  category: string;
  preview: string | null;
  labels: string;
};
export type Credits = {
  tier: string;
  used: number;
  limit: number;
  left: number;
  resets: number | null;
  commercial: boolean;
};
type Voices = {
  voices: Voice[];
  credits: Credits;
  models: Record<string, { name: string; rate: number; limit: number; tags: boolean }>;
  delivery: Record<string, string>;
};

/** Choose the narrator: ElevenLabs voices with their previews (listening is free) and the voice model. */
export const VoicePicker: React.FC<{
  value: Profile["voice"];
  onChange: (v: Profile["voice"]) => void;
  available: boolean;
}> = ({ value, onChange, available }) => {
  const [data, setData] = useState<Voices | null>(null);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (available) api<Voices>("/channel/voices").then(setData, (e) => setError((e as Error).message));
  }, [available]);
  if (!available) return <div className="notice err">Add ELEVENLABS_API_KEY to .env to choose the narrator's voice.</div>;
  const voice = data?.voices.find((v) => v.id === value.id);
  const listen = () => {
    if (!voice?.preview) return;
    audio.current?.pause();
    audio.current = new Audio(voice.preview);
    audio.current.play().catch(() => {});
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="grid">
        <label className="field">
          <span>Narrator voice (ElevenLabs)</span>
          <select
            value={value.id}
            onChange={(e) => {
              const v = data?.voices.find((x) => x.id === e.target.value);
              onChange({ ...value, id: e.target.value, name: v?.name ?? "" });
            }}
          >
            <option value="">{data ? "Choose a voice…" : error ? "Could not load voices" : "Loading voices…"}</option>
            {(data?.voices ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.labels ? ` · ${v.labels}` : ""}
                {v.category === "cloned" ? " · your clone" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Voice model</span>
          <select value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })}>
            {Object.entries(data?.models ?? { [value.model]: { name: value.model } }).map(([k, m]) => (
              <option key={k} value={k}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" title="How much feeling the voice puts in. Expressive follows [delivery cues] most; Steady stays calm and even.">
          <span>Delivery</span>
          <select value={value.delivery || "natural"} onChange={(e) => onChange({ ...value, delivery: e.target.value })}>
            {Object.entries(data?.delivery ?? { natural: "Natural" }).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data && !data.models[value.model]?.tags ? (
        <p className="hint" style={{ margin: 0 }}>
          This model can't perform delivery cues like [curious] or [whispers]: they are left out (pauses still work). Eleven v4 performs them and sounds the most human.
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="btn secondary small" disabled={!voice?.preview} onClick={listen}>
          ▶ Listen
        </button>
        {data ? (
          <span className="hint">
            {data.credits.left.toLocaleString()} of {data.credits.limit.toLocaleString()} credits left this month (≈ {Math.floor(data.credits.left / 2700)} three-minute videos).
          </span>
        ) : null}
      </div>
      {data && !data.credits.commercial ? (
        <div className="notice err">
          Your ElevenLabs plan is “{data.credits.tier || "free"}”: its audio may not be used commercially. A monetized channel needs Starter or above.
        </div>
      ) : null}
      {error ? <div className="notice err">{error}</div> : null}
    </div>
  );
};
