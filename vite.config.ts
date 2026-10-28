import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://sam-t-g.github.io/rcc-live-lecture/ in production, from / locally.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/rcc-live-lecture/" : "/",
  server: { host: true, port: 5173 },
}));
