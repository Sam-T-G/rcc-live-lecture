// Runs before every test (vitest.config.ts setupFiles). fetch throws, so an action that would
// call Gemini fails the test instead of sending a real request. A test that needs fetch stubs it
// again with vi.stubGlobal("fetch", ...).
import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("No network in tests: stub fetch.");
  });
});
