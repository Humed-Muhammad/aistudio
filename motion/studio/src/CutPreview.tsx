import { useEffect, useRef } from "react";

/**
 * The recording played through the current cut: it jumps over every part that is unticked or trimmed, so a change
 * in the Cut tab shows at once, before the edit is rebuilt. Joins are hard jumps here; the built edit fades them.
 */
export const CutPreview: React.FC<{
  src: string;
  ranges: [number, number][];
  duration: number;
}> = ({ src, ranges, duration }) => {
  const video = useRef<HTMLVideoElement>(null);
  const at = useRef(0); // index of the range playing now
  const wanted = useRef<number | null>(null); // a jump we made, so it is not taken for the viewer scrubbing

  useEffect(() => {
    const v = video.current;
    if (!v || !ranges.length) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (v.paused || v.seeking) return;
      const t = v.currentTime;
      if (wanted.current !== null) {
        if (Math.abs(t - wanted.current) > 0.5) return;
        wanted.current = null;
      }
      const jump = (i: number) => {
        at.current = i;
        if (i >= ranges.length) {
          v.pause();
          at.current = 0;
          return;
        }
        wanted.current = ranges[i][0];
        v.currentTime = ranges[i][0];
      };
      const r = ranges[at.current];
      if (r && t >= r[0] - 0.05 && t < r[1]) return;
      if (r && t >= r[1] && t < r[1] + 0.5) return jump(at.current + 1);
      // The viewer scrubbed: carry on from the kept range there, or the next one after it.
      const inside = ranges.findIndex(([a, b]) => t >= a && t < b);
      if (inside >= 0) at.current = inside;
      else {
        const next = ranges.findIndex(([a]) => a > t);
        jump(next < 0 ? ranges.length : next);
      }
    };
    frame = requestAnimationFrame(tick);
    const start = () => {
      if (v.currentTime < 0.05 || v.ended) {
        at.current = 0;
        wanted.current = ranges[0][0];
        v.currentTime = ranges[0][0];
      }
    };
    v.addEventListener("play", start);
    return () => {
      cancelAnimationFrame(frame);
      v.removeEventListener("play", start);
    };
  }, [ranges]);

  return (
    <div className="cutpreview">
      <video ref={video} src={src} controls playsInline />
      <div className="cutstrip" title="Kept parts of your recording">
        {ranges.map(([a, b], i) => (
          <span
            key={i}
            style={{
              left: `${(a / duration) * 100}%`,
              width: `${Math.max(((b - a) / duration) * 100, 0.15)}%`,
            }}
            onClick={() => {
              const v = video.current;
              if (!v) return;
              at.current = i;
              wanted.current = a;
              v.currentTime = a;
            }}
          />
        ))}
      </div>
    </div>
  );
};
