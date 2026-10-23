import { jobUrl, sendJSON } from "../api";
import type { JobApi } from "../JobView";
import { Sounds } from "./Sounds";

/** Everything you hear: voice volume, background noise, automatic sound design and the sound library. */
export const SoundTab: React.FC<JobApi> = ({ job, busy, show, savePlan, toast }) => {
  const p = job.plan;
  const patch = async (body: object) => {
    try {
      show(await sendJSON(jobUrl(job.id), "PATCH", body));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="inspector">
      <h2>Sound</h2>
      <p className="lead">Your voice is never regenerated: only its volume changes, and effects sit under it.</p>
      <div className="grid">
        <label className="field">
          <span>Voice volume</span>
          <select value={job.voice} disabled={busy} onChange={(e) => patch({ voice: e.target.value })}>
            <option value="level">Even & loud (recommended)</option>
            <option value="off">As recorded</option>
          </select>
        </label>
        <label className="field">
          <span>Background noise</span>
          <select value={job.noise} disabled={busy} onChange={(e) => patch({ noise: e.target.value })}>
            <option value="off">Original audio</option>
            <option value="light">Light clean-up (free)</option>
            <option value="strong" disabled={!job.strong_noise_available && job.noise !== "strong"}>
              Strong (ElevenLabs, ~1,000 credits/min)
            </option>
          </select>
        </label>
        {p ? (
          <label className="field">
            <span>Sound effects</span>
            <select value={String(p.auto_sound !== false)} disabled={busy} onChange={(e) => savePlan({ ...p, auto_sound: e.target.value === "true" })}>
              <option value="true">Automatic (whooshes, pops, clicks)</option>
              <option value="false">Only sounds in the plan</option>
            </select>
          </label>
        ) : null}
      </div>
      {job.manifest && job.noise !== (job.manifest.noise ?? "off") ? (
        <div className="stale" style={{ marginTop: 12 }}>The noise setting is used when you rebuild the edit (Cut section).</div>
      ) : null}
      <Sounds busy={busy} toast={toast} />
    </div>
  );
};
