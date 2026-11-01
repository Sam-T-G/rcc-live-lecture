// The screen lab's own Vite config: the real app (../../src) with convex/react swapped for the
// fixture mock in lib/convex-mock.tsx, so every screen renders with no backend.
//
//   node_modules/.bin/vite --config design/lab/vite.config.ts --port 47211
//
// The port comes from --port on the command line (or LAB_PORT, which shoot.mjs sets). Each
// checkout and port gets its own optimizer cache in the system temp folder, so several lab
// servers can run at once, none touches node_modules/.vite (the main dev server's), and nothing
// lands in the repo for eslint to read.
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const LAB = dirname(fileURLToPath(import.meta.url));
const W = resolve(LAB, "../..");

function portFromArgs(): number {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) return Number(argv[i + 1]);
    if (argv[i].startsWith("--port=")) return Number(argv[i].slice(7));
  }
  if (process.env.LAB_PORT) return Number(process.env.LAB_PORT);
  throw new Error("The screen lab needs a port: pass --port <n> (or set LAB_PORT).");
}

const port = portFromArgs();
if (!Number.isInteger(port) || port <= 0) throw new Error(`The screen lab got a bad port: ${port}`);
if ([5173, 5174, 47123, 47124].includes(port)) throw new Error(`Port ${port} belongs to the app's own build. Pick another.`);

// node_modules in a worktree can be a link to the main checkout's; Vite serves files by their real path.
let realModules = resolve(W, "node_modules");
try {
  realModules = realpathSync(realModules);
} catch {
  /* no link: the plain path */
}

const checkout = createHash("sha1").update(LAB).digest("hex").slice(0, 10);

export default defineConfig({
  root: LAB,
  cacheDir: join(tmpdir(), "rcc-live-lecture-lab", checkout, String(port)),
  plugins: [react()],
  publicDir: resolve(LAB, "public"),
  clearScreen: false,
  resolve: {
    alias: [{ find: /^convex\/react$/, replacement: resolve(LAB, "lib/convex-mock.tsx") }],
  },
  // Screens render as the live site does: no typed test sign-in form, no dev-only lines.
  define: { "import.meta.env.DEV": "false" },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    hmr: false,
    fs: { strict: true, allow: [W, realModules] },
  },
  optimizeDeps: {
    // Every page and lazy chunk, so the optimizer finds all deps up front and never reloads a page
    // halfway through a screenshot.
    entries: ["main.tsx", resolve(W, "src") + "/**/*.tsx"],
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
      "convex/server",
      "convex/values",
      "qrcode.react",
      "jsqr",
    ],
    exclude: ["convex/react"],
  },
});
