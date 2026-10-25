// Review stills of a film's scenes, each at the moment that shows it best (its template's poster), for films.py check:
//   node scripts/film-stills.mjs PROPS.json OUT_DIR [--scenes 0,2] [--at 0.6] [--scale 0.5]
// PROPS.json is the film's render props (film-props.json). Writes OUT_DIR/scene-01.png … (1 = first scene).
// Bundles once. Uses installed Chrome when SHORTS_BROWSER is not set.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, d) => {
  const i = args.indexOf(name);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const only = flag("--scenes", null);
const at = flag("--at", null);
const scale = Number(flag("--scale", "0.5"));
const publicDir = flag("--public-dir", null);
const [propsFile, out] = args;
if (!propsFile || !out) throw new Error("usage: node scripts/film-stills.mjs PROPS.json OUT_DIR [--scenes 0,2] [--at 0.6]");
fs.mkdirSync(out, { recursive: true });
const props = JSON.parse(fs.readFileSync(propsFile, "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(here, "../src/film/catalog.gen.json"), "utf8")).scenes;
const indexes = only ? only.split(",").map(Number) : props.film.scenes.map((_, i) => i);
const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = process.env.SHORTS_BROWSER || (fs.existsSync(mac) ? mac : null);
const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts"), publicDir: publicDir ?? undefined });
for (const index of indexes) {
  const scene = props.film.scenes[index];
  if (!scene) continue;
  const inputProps = { ...props, index };
  const composition = await selectComposition({ serveUrl, id: "FilmScene", inputProps, browserExecutable });
  const moment = at != null ? Number(at) : (catalog[scene.template]?.poster ?? 0.7);
  const frame = Math.min(composition.durationInFrames - 1, Math.round(composition.durationInFrames * moment));
  const file = path.join(out, `scene-${String(index + 1).padStart(2, "0")}.png`);
  await renderStill({ serveUrl, composition, inputProps, frame, output: file, scale, browserExecutable });
  console.log(file);
}
