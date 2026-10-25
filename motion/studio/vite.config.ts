import { defineConfig } from "vite";

// Built into ../static/studio and served by the app at /shorts. `npm run studio` runs a dev server
// on :5173 that forwards API and media requests to the app on :8770.
const app = process.env.STUDIO_API ?? "http://127.0.0.1:8770";

export default defineConfig({
  root: __dirname,
  base: "/static/studio/",
  oxc: { jsx: { runtime: "automatic" } },
  build: { outDir: "../../static/studio", emptyOutDir: true, chunkSizeWarningLimit: 3000 },
  server: {
    port: 5173,
    proxy: { "/motion": app, "/shorts/jobs": app, "/shorts/looks": app, "/shorts/setup": app, "/runs": app },
  },
});
