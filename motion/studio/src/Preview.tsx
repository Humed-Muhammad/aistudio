import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { Shorts } from "../../src/Shorts";
import { api, jobUrl, type Plan, type ShortsProps } from "./api";

type Props = {
  id: string;
  /** Changes whenever the saved plan changes, so the props are fetched again. */
  version: string;
  /** Unsaved plan changes to show on top of the saved plan (Look and Captions tabs). */
  override?: Partial<Plan>;
};

/**
 * The edit exactly as the renderer will draw it (same Remotion components), played live in the browser.
 * Captions, cards, backgrounds and sound all play; nothing is rendered to a file.
 */
export const Preview = forwardRef<PlayerRef, Props>(({ id, version, override }, ref) => {
  const [props, setProps] = useState<ShortsProps | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api<ShortsProps>(jobUrl(id, "props"))
      .then((p) => live && (setProps(p), setError("")))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [id, version]);

  const input = useMemo(
    () => (props && override ? { ...props, plan: { ...props.plan, ...override } } : props),
    [props, override],
  );

  if (error) return <div className="empty">{error}</div>;
  if (!input) return <div className="frame" style={{ display: "grid", placeItems: "center" }}><div className="spinner" /></div>;
  return (
    <div className="frame" style={{ aspectRatio: `${input.width} / ${input.height}` }}>
      <Player
        ref={ref}
        component={Shorts}
        inputProps={input}
        durationInFrames={input.durationInFrames}
        fps={input.fps}
        compositionWidth={input.width}
        compositionHeight={input.height}
        style={{ width: "100%", height: "100%" }}
        controls
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
        acknowledgeRemotionLicense
      />
    </div>
  );
});
