// Local word-level transcription with whisper.cpp (no paid calls).
// Usage: node transcribe.mjs AUDIO_16K.wav OUT.json [model] [language|auto]
// With no arguments it only installs whisper.cpp and the model.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const [, , input, output, model = "small", language = "auto"] = process.argv;
const VERSION = "1.5.5";
const whisperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "whisper.cpp");

await installWhisperCpp({ to: whisperPath, version: VERSION, printOutput: false });
await downloadWhisperModel({ model, folder: whisperPath, printOutput: false });
if (!input) process.exit(0);

const whisperCppOutput = await transcribe({
  model,
  whisperPath,
  whisperCppVersion: VERSION,
  inputPath: path.resolve(input),
  tokenLevelTimestamps: true,
  language,
  splitOnWord: true,
  printOutput: false,
  onProgress: (p) => console.log(`PROGRESS ${p.toFixed(3)}`),
});
const { captions } = toCaptions({ whisperCppOutput });
fs.writeFileSync(
  output,
  JSON.stringify({ language: whisperCppOutput.result.language, model, captions }, null, 1),
);
console.log(`${captions.length} words · ${whisperCppOutput.result.language}`);
