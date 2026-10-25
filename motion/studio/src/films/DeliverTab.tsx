import type { FilmState } from "./filmApi";
import { filmUrl } from "./filmApi";

/** Render a draft (half size, quick) or the final, watch them and download. */
export const DeliverTab: React.FC<{ state: FilmState; render: (final: boolean) => void; setDelivery: (d: FilmState["delivery"]) => void }> = ({ state, render, setDelivery }) => {
  const busy = state.render.state === "running";
  const changed = (t?: number) => !!t && (state.edited ?? 0) > t;
  const file = (name: "draft" | "final") => {
    const t = state.renders[name];
    return t ? (
      <div className="export ready" key={name}>
        <h3>
          {name === "final" ? "Final" : "Draft"} {changed(t) ? <span className="tag">older than your edits</span> : null}
        </h3>
        <video src={`${filmUrl(state.id, "files/" + name + ".mp4")}?v=${t}`} controls playsInline style={{ width: "100%", maxHeight: 360, background: "#000", borderRadius: 10 }} />
        <a className="btn secondary small" href={`${filmUrl(state.id, "files/" + name + ".mp4")}?download=true`}>
          Download {name} ↓
        </a>
      </div>
    ) : null;
  };
  return (
    <div>
      <div className="section" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Render</h3>
        <p className="hint" style={{ margin: 0 }}>
          The preview is the film. Rendering writes it to an MP4 on this Mac: a draft at half size in about a minute, the final at full quality. You can keep
          editing while it renders.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" disabled={busy || !state.film.scenes.length} onClick={() => render(false)}>
            Render draft
          </button>
          <button type="button" className="btn secondary" disabled={busy || !state.film.scenes.length} onClick={() => render(true)}>
            Render final
          </button>
        </div>
      </div>
      <div className="section exports" style={{ display: "grid", gap: 14 }}>
        {file("final")}
        {file("draft")}
        {!state.renders.draft && !state.renders.final ? <p className="hint">No renders yet.</p> : null}
      </div>
      <div className="section">
        <h3>Delivery</h3>
        <div className="seg">
          {(["", "sent", "delivered"] as const).map((d) => (
            <button key={d} type="button" className={state.delivery === d ? "on" : ""} onClick={() => setDelivery(d)}>
              {d === "" ? "Not sent" : d === "sent" ? "Sent for review" : "Delivered"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
