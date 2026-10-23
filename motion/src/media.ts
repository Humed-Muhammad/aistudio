import { createContext, useContext } from "react";
import { staticFile } from "remotion";

/**
 * Where job files live. The renderer serves the job folder as its public dir (null → staticFile);
 * the in-browser Player passes the job URL, e.g. "/runs/<job>/".
 */
export const MediaBase = createContext<string | null>(null);

export const useMedia = () => {
  const base = useContext(MediaBase);
  return (path: string) => (base ? base + path : staticFile(path));
};
