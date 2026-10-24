// Renders one still of every library graphic (or the ids given) to a folder, for checking designs:
//   node scripts/element-stills.mjs OUT_DIR [id ...] [--at 0.55] [--style glass]
// Without --at, each graphic is shown at its own poster moment (meta.poster, else 0.55).
// Bundles once, then renders each still at 40% size. Uses installed Chrome when SHORTS_BROWSER is not set.
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
const style = flag("--style", "glass");
const [out, ...only] = args;
if (!out) throw new Error("usage: node scripts/element-stills.mjs OUT_DIR [id ...]");
fs.mkdirSync(out, { recursive: true });
const registry = fs.readFileSync(path.join(here, "../src/elements/registry.gen.ts"), "utf8");
const ids = only.length ? only : [...registry.matchAll(/^ {2}"([^"]+)": \{ meta/gm)].map((m) => m[1]);
const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = process.env.SHORTS_BROWSER || (fs.existsSync(mac) ? mac : null);
const serveUrl = await bundle({ entryPoint: path.join(here, "../src/index.ts") });
for (const id of ids) {
  const inputProps = { id, style };
  const composition = await selectComposition({ serveUrl, id: "Element", inputProps, browserExecutable });
  const metaFile = ["pack", "mine"].map((d) => path.join(here, "../src/elements", d, `${id}.json`)).find((f) => fs.existsSync(f));
  const poster = at != null ? Number(at) : (JSON.parse(fs.readFileSync(metaFile, "utf8")).poster ?? 0.55);
  const frame = Math.min(composition.durationInFrames - 1, Math.round(composition.durationInFrames * poster));
  await renderStill({ serveUrl, composition, inputProps, frame, output: path.join(out, `${id}.png`), scale: 0.4, browserExecutable });
  console.log(`${id} ✓`);
}
