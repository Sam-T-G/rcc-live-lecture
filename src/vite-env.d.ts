/// <reference types="vite/client" />

// The app typecheck follows imports into convex/, whose functions read env vars on the
// server (Convex supplies the real `process` there). This is all those files need.
declare const process: { env: Record<string, string | undefined> };
