import { useEffect, useState } from "react";
import { api, clock } from "../api";
import { mediaUrl, type Profile, type VideoState } from "./channelApi";
import type { Credits } from "./VoicePicker";

/** The voice-over: what it costs now (only changed paragraphs), one click to speak it, and the result to listen to. */
export const VoiceTab: React.FC<{
  v: VideoState;
  profile: Profile | undefined;
  busy: boolean;
  speak: (credits: number) => void;
  channels: () => void;
}> = ({ v, profile, busy, speak, channels }) => {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ credits: Credits }>("/channel/voices").then(
      (d) => setCredits(d.credits),
      (e) => setError((e as Error).message),
    );
  }, [v.files["voice.wav"]]);
  const est = v.voice;
  if (!profile?.voice.id)
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Choose the narrator first</h3>
        <p className="lead">The channel profile holds the ElevenLabs voice every video uses.</p>
        <button type="button" className="btn" onClick={channels}>
          Open the channel profile →
        </button>
      </div>
    );
  const short = credits && est ? credits.left < est.credits : false;
  const changed = v.voice_changed && v.voiced;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0 }}>{profile.voice.name || "Narrator"}</h3>
            <span className="hint">
              {profile.voice.model} · {profile.voice.delivery || "natural"} delivery
            </span>
          </div>
          {v.files["voice.wav"] ? <audio controls src={mediaUrl(v.id, "voice.wav", v.files["voice.wav"])} style={{ maxWidth: 420, width: "100%" }} /> : null}
        </div>
        {!v.script.sections.length ? (
          <p className="hint">Write the script first.</p>
        ) : est && est.credits ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {changed ? (
              <div className="notice">
                The voice-over you have was made with {v.voice_changed!.same_voice ? "the same voice" : "another voice"} on {v.voice_changed!.model} ({v.voice_changed!.delivery}{" "}
                delivery). It still works: render with it, or voice it again with {profile.voice.name || "the channel's voice"} below.
              </div>
            ) : null}
            <p style={{ margin: 0 }}>
              {changed
                ? "Voicing it again with the channel's voice"
                : est.todo.length === est.paragraphs
                  ? "Every paragraph needs voicing"
                  : `${est.todo.length} changed paragraph${est.todo.length === 1 ? "" : "s"} need${est.todo.length === 1 ? "s" : ""} a new take`}
              : <b>{est.credits.toLocaleString()} ElevenLabs credits</b>
              {credits ? <span className="hint"> · {credits.left.toLocaleString()} left this month</span> : null}
            </p>
            {!v.approved ? (
              <div className="notice">The script is not approved yet. You can still voice it, but read it first: re-voicing changed paragraphs costs credits again.</div>
            ) : null}
            {short ? <div className="notice err">Not enough credits left this month for this voice-over.</div> : null}
            {credits && !credits.commercial ? (
              <div className="notice err">
                Your ElevenLabs plan is “{credits.tier || "free"}”: its audio may not be used in monetized videos. Upgrade to Starter or above before publishing.
              </div>
            ) : null}
            <div className="row">
              <button type="button" className="btn" disabled={busy || short} onClick={() => speak(est.credits)}>
                Voice it · {est.credits.toLocaleString()} credits
              </button>
              <span className="hint">Each paragraph is spoken once and kept: edit one later and only that one is re-voiced.</span>
            </div>
          </div>
        ) : v.voiced && v.words ? (
          <p className="hint" style={{ marginTop: 12 }}>
            Voice-over ready: {clock(v.words.duration)} · {v.words.words.length.toLocaleString()} words timed · {v.words.sections.length} sections.
          </p>
        ) : est ? (
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => speak(0)}>
              Join the voice-over again (free)
            </button>
          </div>
        ) : null}
        {error ? <div className="notice err">{error}</div> : null}
      </div>
      {v.words ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Chapters</h3>
          <div className="facts">
            {v.words.sections.map((s) => (
              <div key={s.id} className="fact">
                <span>{s.title || s.kind}</span>
                <b className="mono">{clock(s.start)}</b>
              </div>
            ))}
          </div>
          {v.files["captions.srt"] ? (
            <p style={{ marginBottom: 0 }}>
              <a href={mediaUrl(v.id, "captions.srt", v.files["captions.srt"])} download>
                Download subtitles (captions.srt)
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
