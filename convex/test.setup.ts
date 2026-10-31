/// <reference types="vite/client" />
// The Convex modules convex-test loads. The pattern leaves out every file with two or more dots
// (test.setup.ts, test.helpers.ts, *.test.ts, auth.config.ts), the same files `npx convex dev`
// leaves out of the deployed bundle and convex/_generated/api.d.ts.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
