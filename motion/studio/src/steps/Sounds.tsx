import { useEffect, useRef, useState } from "react";
import { api, sendJSON } from "../api";

type Option = { id: string; title: string; ready: boolean };
type Family = { id: string; label: string; use: string; choice: string; options: Option[] };

/** Pick the sound for each kind of moment (listen first); the choice is used in every video from the next render. */
export const Sounds: React.FC<{ busy: boolean; toast: (msg: string, error?: boolean) => void }> = ({ busy, toast }) => {
  const [families, setFamilies] = useState<Family[]>([]);
  const [open, setOpen] = useState("whoosh");
  const [playing, setPlaying] = useState("");
  const [saving, setSaving] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api<Family[]>("/shorts/sounds").then(setFamilies, (e) => toast((e as Error).message, true));
    return () => audio.current?.pause();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const url = (fam: string, choice: string) => `/shorts/sounds/${fam}/play?choice=${encodeURIComponent(choice)}`;
  const play = (fam: string, choice: string) => {
    audio.current?.pause();
    const key = fam + choice;
    if (playing === key) {
      setPlaying("");
      return;
    }
    const a = new Audio(url(fam, choice));
    a.onended = () => setPlaying((p) => (p === key ? "" : p));
    a.onerror = () => {
      setPlaying("");
      toast("Could not load that sound. Check your internet connection.", true);
    };
    audio.current = a;
    setPlaying(key);
    a.play().catch(() => setPlaying(""));
  };
  const pick = async (fam: string, choice: string) => {
    setSaving(fam + choice);
    try {
      setFamilies(await sendJSON<Family[]>(`/shorts/sounds/${fam}`, "PUT", { choice }));
      toast("Saved. Render a new draft to hear it in your video.");
    } catch (e) {
      toast((e as Error).message, true);
    }
    setSaving("");
  };

  return (
    <div className="section" style={{ marginTop: 16 }}>
      <h3>Sound effects</h3>
      <p className="hint" style={{ marginTop: -4 }}>
        Listen with ▶ and choose one for each moment. Used in all your videos. Mixkit sounds are free for your videos, no credit needed;
        they stay on this Mac.
      </p>
      <div className="sounds">
        {families.map((f) => {
          const current = f.options.find((o) => o.id === f.choice);
          return (
            <div key={f.id} className={"soundfam" + (open === f.id ? " open" : "")}>
              <button type="button" className="soundhead" onClick={() => setOpen(open === f.id ? "" : f.id)}>
                <b>{f.label}</b>
                <small>{f.use}</small>
                <span className={"tag" + (f.choice === "off" ? "" : " ok")}>{f.choice === "off" ? "Off" : (current?.title ?? "Custom")}</span>
              </button>
              {open === f.id ? (
                <div className="soundlist">
                  {f.options.map((o) => (
                    <div key={o.id} className={"soundopt" + (f.choice === o.id ? " on" : "")}>
                      <button type="button" className="playbtn" aria-label={`Play ${o.title}`} onClick={() => play(f.id, o.id)}>
                        {playing === f.id + o.id ? "■" : "▶"}
                      </button>
                      <span>{o.title}</span>
                      <button
                        type="button"
                        className={"btn small" + (f.choice === o.id ? "" : " secondary")}
                        disabled={busy || f.choice === o.id || !!saving}
                        onClick={() => pick(f.id, o.id)}
                      >
                        {saving === f.id + o.id ? "Saving…" : f.choice === o.id ? "In use" : "Use"}
                      </button>
                    </div>
                  ))}
                  <div className={"soundopt" + (f.choice === "off" ? " on" : "")}>
                    <span className="playbtn" />
                    <span>No sound</span>
                    <button
                      type="button"
                      className={"btn small" + (f.choice === "off" ? "" : " secondary")}
                      disabled={busy || f.choice === "off" || !!saving}
                      onClick={() => pick(f.id, "off")}
                    >
                      {f.choice === "off" ? "Off" : "Turn off"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
