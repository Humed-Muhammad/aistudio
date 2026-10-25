// Renders stills of film scene templates with their default words, for checking designs:
//   node scripts/scene-stills.mjs OUT_DIR [id ...] [--at 0.7] [--format portrait,landscape] [--style glass] [--mode dark]
// Without --at, each scene is shown at its poster moment (meta.poster, else 0.7). Bundles once; renders at 40 % size.
// Uses installed Chrome when SHORTS_BROWSER is not set.
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
const at = flag("--at", null);
const formats = flag("--format", "portrait").split(",");
const style = flag("--style", "glass");
const mode = flag("--mode", "dark");
const [out, ...only] = args;
if (!out) throw new Error("usage: node scripts/scene-stills.mjs OUT_DIR [id ...]");
fs.mkdirSync(out, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(here, "../src/film/catalog.gen.json"), "utf8")).scenes;
const ids = only.length ? only : Object.keys(catalog);
const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = process.env.SHORTS_BROWSER || (fs.existsSync(mac) ? mac : null);
const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts") });
for (const id of ids) {
  if (!catalog[id]) {
    console.log(`${id} ✗ no such scene`);
    process.exitCode = 1;
    continue;
  }
  for (const format of formats) {
    const inputProps = { id, film: { format, style, mode } };
    const composition = await selectComposition({ serveUrl, id: "ScenePreview", inputProps, browserExecutable });
    for (const moment of (at ?? String(catalog[id].poster ?? 0.7)).split(",").map(Number)) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round(composition.durationInFrames * moment));
      const name = `${id}-${format}${at ? "-" + Math.round(moment * 100) : ""}.png`;
      await renderStill({ serveUrl, composition, inputProps, frame, output: path.join(out, name), scale: 0.4, browserExecutable });
      console.log(`${name} ✓`);
    }
  }
}
