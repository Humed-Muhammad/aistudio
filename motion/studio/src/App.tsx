import { useCallback, useEffect, useRef, useState } from "react";
import { api, sendJSON, type Client, type JobSummary } from "./api";
import { Clients } from "./Clients";
import { JobView } from "./JobView";
import { Upload } from "./steps/Upload";
import { applyTheme, savedTheme, THEMES } from "./theme";
import { Videos } from "./Videos";
import { ClipView, YouTubeList } from "./YouTube";
import { FilmList, NewFilm } from "./films/Films";
import { FilmView } from "./films/FilmView";
import type { FilmSetup, FilmSummary } from "./films/filmApi";
import { ResearchList, ResearchView } from "./channel/Research";
import { Profiles } from "./channel/Profiles";
import type { ChannelSetup, Profile, Topic, VideoState } from "./channel/channelApi";
import { ChannelVideos } from "./channel/ChannelVideos";
import { TopicResearch } from "./channel/TopicResearch";
import { VideoView } from "./channel/VideoView";

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
  | { page: "clients"; client: string | null }
  | { page: "youtube" }
  | { page: "clips"; id: string }
  | { page: "films" }
  | { page: "film"; id: string }
  | { page: "newfilm"; client: string | null }
  | { page: "research" }
  | { page: "topics" }
  | { page: "study"; id: string }
  | { page: "channels" }
  | { page: "cvideos" }
  | { page: "cvideo"; id: string };

const parse = (): Route => {
  const q = new URLSearchParams(location.search);
  if (q.get("job")) return { page: "job", id: q.get("job")! };
  if (q.get("film")) return { page: "film", id: q.get("film")! };
  if (q.get("clips")) return { page: "clips", id: q.get("clips")! };
  if (q.get("research")) return { page: "study", id: q.get("research")! };
  if (q.get("view") === "research") return { page: "research" };
  if (q.get("view") === "topics") return { page: "topics" };
  if (q.get("view") === "channels") return { page: "channels" };
  if (q.get("video")) return { page: "cvideo", id: q.get("video")! };
  if (q.get("view") === "channel") return { page: "cvideos" };
  if (q.get("view") === "youtube") return { page: "youtube" };
  if (q.has("newfilm")) return { page: "newfilm", client: q.get("client") };
  if (q.get("view") === "films") return { page: "films" };
  if (q.has("new")) return { page: "new", client: q.get("client") };
  if (q.get("view") === "clients") return { page: "clients", client: q.get("client") };
  return { page: "videos" };
};
const href = (r: Route) =>
  r.page === "topics"
    ? "?view=topics"
    : r.page === "cvideos"
      ? "?view=channel"
      : r.page === "cvideo"
        ? "?video=" + r.id
        : r.page === "research"
          ? "?view=research"
          : r.page === "study"
            ? "?research=" + r.id
            : r.page === "channels"
              ? "?view=channels"
              : r.page === "youtube"
                ? "?view=youtube"
                : r.page === "clips"
                  ? "?clips=" + r.id
                  : r.page === "film"
                    ? "?film=" + r.id
                    : r.page === "films"
                      ? "?view=films"
                      : r.page === "newfilm"
                        ? "?newfilm" + (r.client ? "&client=" + r.client : "")
                        : r.page === "job"
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
  const [films, setFilms] = useState<FilmSummary[] | null>(null);
  const [filmSetup, setFilmSetup] = useState<FilmSetup | null>(null);
  const timer = useRef<number>(undefined);
  const filmTimer = useRef<number>(undefined);
  const [channelSetup, setChannelSetup] = useState<ChannelSetup | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [studyKind, setStudyKind] = useState<"niche" | "topics">("niche");
  const loadProfiles = useCallback(() => api<Profile[]>("/channel/profiles").then(setProfiles, () => {}), []);

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
  const loadFilms = useCallback(async () => {
    try {
      const list = await api<FilmSummary[]>("/motion/films");
      setFilms(list);
      window.clearTimeout(filmTimer.current);
      filmTimer.current = window.setTimeout(loadFilms, list.some((f) => f.state === "running") ? 3000 : 20000);
    } catch {
      filmTimer.current = window.setTimeout(loadFilms, 20000);
    }
  }, []);
  const loadClients = useCallback(() => api<Client[]>("/shorts/clients").then(setClients, () => {}), []);

  useEffect(() => {
    loadJobs();
    loadClients();
    api<Setup>("/shorts/setup")
      .then(setSetup)
      .catch(() => {});
    loadFilms();
    api<FilmSetup>("/motion/setup")
      .then(setFilmSetup)
      .catch(() => {});
    api<ChannelSetup>("/channel/setup")
      .then(setChannelSetup)
      .catch(() => {});
    loadProfiles();
    const back = () => setRoute(parse());
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      window.clearTimeout(timer.current);
      window.clearTimeout(filmTimer.current);
    };
  }, [loadJobs, loadClients, loadFilms, loadProfiles]);

  const go = (r: Route) => {
    setRoute(r);
    history.pushState(null, "", href(r));
    window.scrollTo(0, 0);
  };
  const pickTheme = (id: string) => {
    applyTheme(id);
    setTheme(id);
  };
  /** A topic from a niche report becomes a channel video, and Claude starts researching and writing its script. */
  /** A topic from a research becomes a channel video (with the topic's angle, points and sources as notes), and Claude
   * starts researching and writing its script. Topic research already knows its channel; niche research asks. */
  const makeVideo = (research: string) => async (t: Topic, owner: string | null) => {
    if (!profiles.length) {
      alert("Create your channel first (audience, narrator voice, look); then pick the topic again.");
      return go({ page: "channels" });
    }
    const profile =
      profiles.find((p) => p.id === owner) ??
      (profiles.length === 1 ? profiles[0] : profiles.find((p) => p.name === prompt(`Which channel? ${profiles.map((p) => p.name).join(" / ")}`, profiles[0].name)));
    if (!profile) return;
    try {
      const v = await sendJSON<VideoState>("/channel/videos", "POST", { profile: profile.id, topic: t.title, hook: t.hook, research, based_on: t.based_on, write: true });
      go({ page: "cvideo", id: v.id });
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const editing = route.page === "job";
  const filming = route.page === "film" || route.page === "films" || route.page === "newfilm";
  const channeling = ["cvideos", "cvideo", "research", "topics", "study", "channels"].includes(route.page);

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <button type="button" className="brand" onClick={() => go({ page: "videos" })} title="Humed’s AI Studio">
          <i />
          <span>Humed’s AI Studio</span>
        </button>
        <button
          type="button"
          className="btn newbtn"
          onClick={() => go(channeling ? { page: "cvideos" } : filming ? { page: "newfilm", client: null } : { page: "new", client: null })}
        >
          ＋<span> {channeling ? "New channel video" : filming ? "New film" : "New video"}</span>
        </button>
        <nav className="railnav" aria-label="Shorts">
          <span className="raillabel">Shorts</span>
          <button type="button" className={route.page === "videos" || route.page === "new" || editing ? "on" : ""} onClick={() => go({ page: "videos" })}>
            <span className="ico">▦</span>
            <span>Videos</span>
          </button>
          <button
            type="button"
            className={route.page === "youtube" || route.page === "clips" ? "on" : ""}
            onClick={() => go({ page: "youtube" })}
            title="Paste a YouTube link: Claude finds the best moments and makes them into shorts"
          >
            <span className="ico">▶</span>
            <span>From YouTube</span>
          </button>
          <button type="button" className={route.page === "clients" ? "on" : ""} onClick={() => go({ page: "clients", client: null })}>
            <span className="ico">◉</span>
            <span>Clients</span>
          </button>
        </nav>
        <nav className="railnav" aria-label="Motion Studio">
          <span className="raillabel">Motion Studio</span>
          <button type="button" className={filming ? "on" : ""} onClick={() => go({ page: "films" })} title="Promos, product films and explainers drawn in code">
            <span className="ico">✦</span>
            <span>Films</span>
          </button>
        </nav>
        <nav className="railnav" aria-label="YouTube channel">
          <span className="raillabel">YouTube channel</span>
          <button
            type="button"
            className={route.page === "cvideos" || route.page === "cvideo" ? "on" : ""}
            onClick={() => go({ page: "cvideos" })}
            title="Faceless videos: script, ElevenLabs voice, shots, long video and shorts"
          >
            <span className="ico">▤</span>
            <span>Channel videos</span>
          </button>
          <button
            type="button"
            className={route.page === "topics" || (route.page === "study" && studyKind === "topics") ? "on" : ""}
            onClick={() => go({ page: "topics" })}
            title="What your channel should make next: recent hits in your niche, competitors and searches, judged by Claude"
          >
            <span className="ico">✧</span>
            <span>Topic ideas</span>
          </button>
          <button
            type="button"
            className={route.page === "research" || (route.page === "study" && studyKind === "niche") ? "on" : ""}
            onClick={() => go({ page: "research" })}
            title="Find a niche: proven videos from small channels, judged by Claude"
          >
            <span className="ico">⌕</span>
            <span>Niche research</span>
          </button>
          <button type="button" className={route.page === "channels" ? "on" : ""} onClick={() => go({ page: "channels" })} title="Your channels: audience, narrator voice, look">
            <span className="ico">◎</span>
            <span>Channels</span>
          </button>
        </nav>
        <nav className="railnav tools" aria-label="Other tools">
          <span className="raillabel">Tools</span>
          <a href="/graphics" title="Advanced: HTML + GSAP compositions written by Claude Code (HyperFrames)">
            <span className="ico">⌘</span>
            <span>HTML motion (advanced)</span>
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
        {route.page === "research" ? (
          <ResearchList setup={channelSetup} profiles={profiles} open={(id) => go({ page: "study", id })} />
        ) : route.page === "study" ? (
          <ResearchView
            key={route.id}
            id={route.id}
            setup={channelSetup}
            back={(kind) => go({ page: kind === "topics" ? "topics" : "research" })}
            makeVideo={makeVideo(route.id)}
            openVideo={(id) => go({ page: "cvideo", id })}
            onKind={setStudyKind}
          />
        ) : route.page === "topics" ? (
          <TopicResearch setup={channelSetup} profiles={profiles} open={(id) => go({ page: "study", id })} channels={() => go({ page: "channels" })} />
        ) : route.page === "cvideos" ? (
          <ChannelVideos
            setup={channelSetup}
            profiles={profiles}
            open={(id) => go({ page: "cvideo", id })}
            channels={() => go({ page: "channels" })}
            ideas={() => go({ page: "topics" })}
          />
        ) : route.page === "cvideo" ? (
          <VideoView key={route.id} id={route.id} setup={channelSetup} profiles={profiles} back={() => go({ page: "cvideos" })} channels={() => go({ page: "channels" })} />
        ) : route.page === "channels" ? (
          <Profiles setup={channelSetup} profiles={profiles} reload={loadProfiles} />
        ) : route.page === "film" ? (
          filmSetup ? (
            <FilmView
              key={route.id}
              id={route.id}
              setup={filmSetup}
              clients={clients}
              onChange={loadFilms}
              onBack={() => go({ page: "films" })}
              onDeleted={() => {
                loadFilms();
                go({ page: "films" });
              }}
            />
          ) : (
            <div className="empty" style={{ margin: 24 }}>
              Loading…
            </div>
          )
        ) : route.page === "newfilm" ? (
          filmSetup ? (
            <NewFilm
              setup={filmSetup}
              clients={clients}
              client={route.client}
              onCreated={(id) => {
                loadFilms();
                go({ page: "film", id });
              }}
            />
          ) : (
            <div className="empty" style={{ margin: 24 }}>
              Loading…
            </div>
          )
        ) : route.page === "films" ? (
          <FilmList films={films} clients={clients} open={(id) => go({ page: "film", id })} create={() => go({ page: "newfilm", client: null })} />
        ) : route.page === "job" ? (
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
        ) : route.page === "youtube" ? (
          <YouTubeList setup={setup} clients={clients} go={go} />
        ) : route.page === "clips" ? (
          <ClipView key={route.id} id={route.id} go={go} onChange={loadJobs} />
        ) : route.page === "clients" ? (
          <Clients clients={clients} jobs={jobs ?? []} selected={route.client} reload={loadClients} go={go} />
        ) : (
          <Videos jobs={jobs} clients={clients} go={go} />
        )}
      </main>
    </div>
  );
};
