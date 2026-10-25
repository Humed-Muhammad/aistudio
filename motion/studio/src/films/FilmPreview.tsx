import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { Film as FilmComponent, filmFrames } from "../../../src/film/Film";
import { SIZES } from "../../../src/film/types";
import { api } from "../api";
import { filmUrl, type Film, type FilmProps } from "./filmApi";

/**
 * The film exactly as the renderer draws it (same Remotion components), played live. It shows the film being edited
 * (unsaved changes included); sounds and assets come from the server, fetched again when version changes.
 */
export const FilmPreview = forwardRef<PlayerRef, { id: string; film: Film; version: string; onFrame?: (frame: number) => void }>(({ id, film, version, onFrame }, ref) => {
  const [media, setMedia] = useState<Pick<FilmProps, "sounds" | "assets" | "base"> | null>(null);
  useEffect(() => {
    let live = true;
    api<FilmProps>(filmUrl(id, "props"))
      .then((p) => live && setMedia({ sounds: p.sounds, assets: p.assets, base: p.base }))
      .catch(() => live && setMedia({ sounds: {}, assets: [], base: `/runs/films/${id}/` }));
    return () => {
      live = false;
    };
  }, [id, version]);

  const [width, height] = SIZES[film.format] ?? SIZES.portrait;
  const props: FilmProps | null = useMemo(
    () => (media ? { film, fps: 30, width, height, durationInFrames: Math.max(1, filmFrames(film, 30)), ...media } : null),
    [film, media, width, height],
  );

  useEffect(() => {
    const player = (ref as React.RefObject<PlayerRef | null>)?.current;
    if (!player || !onFrame) return;
    const tell = (e: { detail: { frame: number } }) => onFrame(e.detail.frame);
    player.addEventListener("frameupdate", tell);
    player.addEventListener("seeked", tell);
    return () => {
      player.removeEventListener("frameupdate", tell);
      player.removeEventListener("seeked", tell);
    };
  }, [ref, onFrame, props === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!props) return <div className="frame filmframe" style={{ aspectRatio: `${width} / ${height}`, display: "grid", placeItems: "center" }}><div className="spinner" /></div>;
  if (!film.scenes.length)
    return (
      <div className="frame filmframe" style={{ aspectRatio: `${width} / ${height}`, display: "grid", placeItems: "center", color: "var(--muted)", padding: 24, textAlign: "center" }}>
        No scenes yet. Ask Claude to make the film, or add a scene below.
      </div>
    );
  return (
    <div className="frame filmframe" style={{ aspectRatio: `${width} / ${height}` }}>
      <Player
        ref={ref}
        component={FilmComponent}
        inputProps={props}
        durationInFrames={props.durationInFrames}
        fps={30}
        compositionWidth={width}
        compositionHeight={height}
        style={{ width: "100%", height: "100%" }}
        controls
        loop
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
        acknowledgeRemotionLicense
      />
    </div>
  );
});
