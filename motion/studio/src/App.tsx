import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Client, type JobSummary } from "./api";
import { Clients } from "./Clients";
import { JobView } from "./JobView";
import { Upload } from "./steps/Upload";
import { applyTheme, savedTheme, THEMES } from "./theme";
import { Videos } from "./Videos";

export type Setup = {
  planner_available: boolean;
  strong_noise_available: boolean;
  palette: Record<string, string>;
};

/** Where the app is, from the address bar: a video, a new upload, the clients page or the video list. */
export type Route =
  | { page: "videos" }
  | { page: "job"; id: string }
  | { page: "new"; client: string | null }
  | { page: "clients"; client: string | null };

const parse = (): Route => {
  const q = new URLSearchParams(location.search);
  if (q.get("job")) return { page: "job", id: q.get("job")! };
  if (q.has("new")) return { page: "new", client: q.get("client") };
  if (q.get("view") === "clients") return { page: "clients", client: q.get("client") };
  return { page: "videos" };
};
const href = (r: Route) =>
  r.page === "job"
    ? "?job=" + r.id
    : r.page === "new"
      ? "?new" + (r.client ? "&client=" + r.client : "")
      : r.page === "clients"
        ? "?view=clients" + (r.client ? "&client=" + r.client : "")
        : location.pathname;

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [route, setRoute] = useState<Route>(parse());
  const [setup, setSetup] = useState<Setup>({ planner_available: false, strong_noise_available: false, palette: {} });
  const [theme, setTheme] = useState(savedTheme());
  const timer = useRef<number>(undefined);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api<JobSummary[]>("/shorts/jobs");
      setJobs(list);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(loadJobs, list.some((j) => j.state === "running") ? 3000 : 15000);
    } catch {
      timer.current = window.setTimeout(loadJobs, 15000);
    }
  }, []);
  const loadClients = useCallback(() => api<Client[]>("/shorts/clients").then(setClients, () => {}), []);

  useEffect(() => {
    loadJobs();
    loadClients();
    api<Setup>("/shorts/setup").then(setSetup).catch(() => {});
    const back = () => setRoute(parse());
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      window.clearTimeout(timer.current);
    };
  }, [loadJobs, loadClients]);

  const go = (r: Route) => {
    setRoute(r);
    history.pushState(null, "", href(r));
    window.scrollTo(0, 0);
  };
  const pickTheme = (id: string) => {
    applyTheme(id);
    setTheme(id);
  };
  const editing = route.page === "job";

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <button type="button" className="brand" onClick={() => go({ page: "videos" })} title="Humed’s AI Studio">
          <i />
          <span>Humed’s AI Studio</span>
        </button>
        <button type="button" className="btn newbtn" onClick={() => go({ page: "new", client: null })}>
          ＋<span> New video</span>
        </button>
        <nav className="railnav" aria-label="Shorts">
          <span className="raillabel">Shorts</span>
          <button type="button" className={route.page === "videos" || editing ? "on" : ""} onClick={() => go({ page: "videos" })}>
            <span className="ico">▦</span>
            <span>Videos</span>
          </button>
          <button type="button" className={route.page === "clients" ? "on" : ""} onClick={() => go({ page: "clients", client: null })}>
            <span className="ico">◉</span>
            <span>Clients</span>
          </button>
        </nav>
        <nav className="railnav tools" aria-label="Other tools">
          <span className="raillabel">Tools</span>
          <a href="/graphics" title="Motion graphics: promos and ads written as code">
            <span className="ico">✦</span>
            <span>Motion graphics</span>
          </a>
          <a href="/cleaner" title="Audio cleaner: remove noise and transcribe">
            <span className="ico">♪</span>
            <span>Audio cleaner</span>
          </a>
        </nav>
        <div className="railfoot">
          <span className="raillabel">Theme</span>
          <div className="themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                title={t.name}
                className={theme === t.id ? "on" : ""}
                style={{ background: `linear-gradient(135deg, ${t.tokens.panel} 55%, ${t.tokens.accent} 55%)` }}
                onClick={() => pickTheme(t.id)}
              />
            ))}
          </div>
        </div>
      </aside>
      <main className="main">
        {route.page === "job" ? (
          <JobView
            key={route.id}
            id={route.id}
            setup={setup}
            clients={clients}
            onChange={() => {
              loadJobs();
              loadClients();
            }}
            onBack={() => go({ page: "videos" })}
            onDeleted={() => {
              loadJobs();
              go({ page: "videos" });
            }}
          />
        ) : route.page === "new" ? (
          <div className="page narrow">
            <Upload
              setup={setup}
              clients={clients}
              client={route.client}
              onCreated={(id) => {
                loadJobs();
                go({ page: "job", id });
              }}
            />
          </div>
        ) : route.page === "clients" ? (
          <Clients
            clients={clients}
            jobs={jobs ?? []}
            selected={route.client}
            reload={loadClients}
            go={go}
          />
        ) : (
          <Videos jobs={jobs} clients={clients} go={go} />
        )}
      </main>
    </div>
  );
};
