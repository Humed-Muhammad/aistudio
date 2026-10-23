import { useEffect, useRef, useState } from "react";
import type { Plan } from "../api";
import type { JobApi } from "../JobView";

type Captions = Pick<
  Plan,
  "caption_preset" | "caption_font" | "caption_motion" | "caption_fill" | "highlight_color" | "caption_y" | "caption_place" | "caption_case" | "caption_speed" | "captions_auto"
>;

const STYLES: [Plan["caption_preset"], string, string][] = [
  ["duo", "Two-line", "Heavy phrase, line 2 in colour"],
  ["karaoke", "Karaoke", "Words appear as spoken"],
  ["pill", "Pill", "Phrase on a colour chip"],
  ["typewriter", "Typewriter", "Letters type in"],
  ["quiet", "Quiet", "Calm serif line"],
  ["float", "Float", "Soft glow, drifting"],
  ["stack", "Stack", "One big word per line"],
  ["sweep", "Light sweep", "Lit as you speak, smooth lift"],
  ["clean", "Clean box", "White on a dark box"],
  ["editorial", "Editorial", "Serif accent words"],
  ["rise", "Rise", "Words slide up"],
  ["bold", "Bold", "Big words, one at a time"],
  ["boxed", "Boxed", "Highlight box on the word"],
  ["minimal", "Minimal", "Small clean phrases"],
  ["none", "None", "No captions"],
];
// Names match the families loaded in styles.css, so each option shows in its own letters.
const FONTS: [NonNullable<Plan["caption_font"]>, string, React.CSSProperties][] = [
  ["noto_black", "Noto Black", { fontFamily: "'Noto Sans Ethiopic', sans-serif", fontWeight: 900 }],
  ["wide", "Wide bold", { fontFamily: "Montserrat, 'Noto Sans Ethiopic', sans-serif", fontWeight: 800 }],
  ["noto_condensed", "Noto Condensed", { fontFamily: "'Noto Sans Ethiopic', sans-serif", fontWeight: 900, fontStretch: "62.5%" }],
  ["noto_bold", "Noto ExtraBold", { fontFamily: "'Noto Sans Ethiopic', sans-serif", fontWeight: 800 }],
  ["menbere", "Menbere", { fontFamily: "Menbere, sans-serif", fontWeight: 700 }],
  ["agbalumo", "Agbalumo", { fontFamily: "Agbalumo, sans-serif" }],
  ["abyssinica", "Abyssinica", { fontFamily: "'Abyssinica SIL', serif" }],
  ["classic", "Style's own", { fontFamily: "Inter, sans-serif", fontWeight: 800 }],
];
const FILLS: [NonNullable<Plan["caption_fill"]>, string, React.CSSProperties][] = [
  ["glass", "Glass", { backgroundImage: "linear-gradient(180deg,#fff 0%,#c9e6ff 46%,#3d86c9 50%,#6ec1ff 68%,#d8eeff 100%)", WebkitBackgroundClip: "text", color: "transparent" }],
  ["chrome", "Chrome", { backgroundImage: "linear-gradient(180deg,#fff 0%,#c3cbd3 44%,#3f4952 49%,#8c98a4 60%,#fff 100%)", WebkitBackgroundClip: "text", color: "transparent" }],
  ["glow", "Glow", { color: "#bfe4ff", textShadow: "0 0 6px #6ec1ff, 0 0 16px #6ec1ffaa" }],
  ["solid", "Solid", { color: "#6ec1ff" }],
];
const MOTIONS: [NonNullable<Plan["caption_motion"]>, string][] = [
  ["pop", "Pop in"],
  ["word", "Word by word"],
  ["rise", "Rise"],
  ["lift", "Smooth lift"],
];

const pick = (p: Plan): Captions => ({
  caption_preset: p.caption_preset,
  caption_font: p.caption_font ?? "noto_black",
  caption_motion: p.caption_motion ?? "pop",
  caption_fill: p.caption_fill ?? "glass",
  highlight_color: p.highlight_color,
  caption_y: p.caption_y,
  caption_place: p.caption_place ?? "face",
  caption_case: p.caption_case ?? "capital",
  caption_speed: p.caption_speed ?? 1,
  captions_auto: p.captions_auto ?? true,
});

export const CaptionsTab: React.FC<JobApi> = ({ job, busy, setup, savePlan, preview }) => {
  const plan = job.plan!;
  const [draft, setDraft] = useState<Captions>(pick(plan));
  const [dirty, setDirty] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => {
    if (!dirty) setDraft(pick(plan));
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: Partial<Captions>) => {
    const value = { ...draft, captions_auto: false, ...next };
    setDraft(value);
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await savePlan({ ...plan, ...value });
      setDirty(false);
    }, 500);
  };
  useEffect(() => () => preview.set(undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => preview.set(draft), [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const duo = draft.caption_preset === "duo";
  const palette = Object.entries(setup.palette);

  return (
    <div className="inspector">
          <div className="compare">
            <span className="hint">
              {dirty ? "Saving…" : draft.captions_auto ? "Colour and style chosen by Claude" : "Your choice · Claude keeps it"}
            </span>
            {!draft.captions_auto ? (
              <button type="button" className="btn secondary small" disabled={busy} onClick={() => change({ captions_auto: true })}>
                Let Claude choose
              </button>
            ) : null}
          </div>
          <h2>Captions</h2>
          <p className="lead">Every choice plays in the preview right away. Press play or scrub to a spoken part.</p>

          <div className="section">
            <h3>Style</h3>
            <div className="looks">
              {STYLES.map(([id, name, note]) => (
                <button key={id} type="button" className={"look" + (draft.caption_preset === id ? " on" : "")} disabled={busy} onClick={() => change({ caption_preset: id })}>
                  <span className={"capsample cap-" + id}>
                    {id === "none" ? "—" : id === "duo" ? (
                      <>
                        <b>ሰላም HELLO</b>
                        <b className="two">ጓደኞቼ</b>
                      </>
                    ) : (
                      "ሰላም Hello"
                    )}
                  </span>
                  <span>
                    {name}
                    <small>{note}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {duo ? (
            <div className="section">
              <h3>Letters</h3>
              <div className="looks">
                {FILLS.map(([id, name, style]) => (
                  <button key={id} type="button" className={"look" + (draft.caption_fill === id ? " on" : "")} disabled={busy} onClick={() => change({ caption_fill: id })}>
                    <span className="capsample" style={{ fontFamily: "'Noto Sans Ethiopic', sans-serif", fontWeight: 900, fontSize: 24 }}>
                      <b style={style}>ሰላም</b>
                    </span>
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="section">
            <h3>Font</h3>
            <div className="fonts">
              {FONTS.map(([id, name, style]) => (
                <button key={id} type="button" className={"fontpick" + (draft.caption_font === id ? " on" : "")} disabled={busy} onClick={() => change({ caption_font: id })}>
                  <span style={style}>ሰላም Hello</span>
                  <small>{name}</small>
                </button>
              ))}
            </div>
          </div>

          {duo ? (
            <div className="section">
              <h3>Motion</h3>
              <div className="seg">
                {MOTIONS.map(([id, name]) => (
                  <button key={id} type="button" className={draft.caption_motion === id ? "on" : ""} disabled={busy} onClick={() => change({ caption_motion: id })}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {["duo", "rise", "sweep"].includes(draft.caption_preset) ? (
            <div className="section">
              <h3>Animation speed</h3>
              <label className="slider">
                Faster
                <input
                  type="range"
                  min={0.6}
                  max={2}
                  step={0.1}
                  value={draft.caption_speed ?? 1}
                  disabled={busy}
                  onChange={(e) => change({ caption_speed: Number(e.target.value) })}
                />
                <output>{(draft.caption_speed ?? 1) === 1 ? "Normal" : `${(draft.caption_speed ?? 1).toFixed(1)}×`}</output>
              </label>
              <p className="hint" style={{ marginTop: 6 }}>Drag right for a slower, softer entrance. Words still appear when you say them.</p>
            </div>
          ) : null}

          <div className="section">
            <h3>{duo ? "Line 2 colour" : "Accent colour"}</h3>
            <div className="swatches">
              {palette.map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  className={"swatch" + (draft.highlight_color.toUpperCase() === hex.toUpperCase() ? " on" : "")}
                  style={{ background: hex }}
                  disabled={busy}
                  onClick={() => change({ highlight_color: hex })}
                />
              ))}
              <input type="color" value={draft.highlight_color} disabled={busy} aria-label="Any colour" onChange={(e) => change({ highlight_color: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div className="section">
            <h3>Letter case</h3>
            <div className="seg">
              {(
                [
                  ["capital", "Capitalized"],
                  ["upper", "ALL CAPS"],
                  ["spoken", "As spoken"],
                ] as const
              ).map(([id, name]) => (
                <button key={id} type="button" className={draft.caption_case === id ? "on" : ""} disabled={busy} onClick={() => change({ caption_case: id })}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <h3>Position</h3>
            <div className="seg">
              <button type="button" className={draft.caption_place !== "fixed" ? "on" : ""} disabled={busy} onClick={() => change({ caption_place: "face" })}>
                Under my face
              </button>
              <button type="button" className={draft.caption_place === "fixed" ? "on" : ""} disabled={busy} onClick={() => change({ caption_place: "fixed" })}>
                Fixed height
              </button>
            </div>
            {draft.caption_place === "fixed" ? (
              <label className="slider" style={{ marginTop: 12 }}>
                Height
                <input type="range" min={0.14} max={0.8} step={0.01} value={draft.caption_y} disabled={busy} onChange={(e) => change({ caption_y: Number(e.target.value) })} />
                <output>{Math.round(draft.caption_y * 100)}%</output>
              </label>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                Just below your chin, following you, never over your mouth, and clear of the app buttons at the bottom.
              </p>
            )}
          </div>
    </div>
  );
};
