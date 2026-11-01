// The screen lab's page. ?s=<scenario id> mounts the real app (src/App.tsx with src/index.css)
// with that scenario's role, fixtures, clock and hash route. With no ?s it lists every scenario.
// Each area's file loads on its own (import.meta.glob, not eager), so a broken area file breaks
// only its own scenarios. window.__lab tells shoot.mjs when the page is ready.
/* eslint-disable react-refresh/only-export-components -- the lab's entry exports nothing, and its
   Vite runs with hmr off (no Fast Refresh). */
import { createRoot } from "react-dom/client";
import type { ConvexReactClient as RealClient } from "convex/react";
import { ConvexReactClient, setAuthMode, setFixtures } from "./lib/convex-mock";
import { pinTime, stubCamera, stubGoogle, stubQr, tick } from "./lib/browser";
import { roleFixtures, seedRole } from "./lib/roles";
import { AREAS, ROLES, type Scenario, type ScenarioMeta } from "./lib/types";

type AreaModule = { scenarios?: Scenario[]; default?: Scenario[] };
const loaders = import.meta.glob<AreaModule>("./scenarios/*.ts");
const areaOf = (path: string) => path.replace(/^.*\//, "").replace(/\.ts$/, "");
const loaderFor = (area: string) => Object.entries(loaders).find(([p]) => areaOf(p) === area)?.[1];

const root = createRoot(document.getElementById("root")!);

function meta(s: Scenario): ScenarioMeta {
  const settleMs = Math.max(0, ...(s.later ?? []).map((l) => l.afterMs));
  const { id, area, route, role, title, expect, now, clicks, type, scrollTo, fullPage, tickMs, camera, qr, google, signIn } = s;
  return { id, area, route, role, title, expect, now, clicks, type, scrollTo, fullPage, tickMs, camera, qr, google, signIn, settleMs };
}

// What's wrong with one scenario's optional fields, as short notes.
function fieldProblems(s: Scenario): string[] {
  const out: string[] = [];
  for (const [i, t] of (s.type ?? []).entries()) {
    if (typeof t?.text !== "string") out.push(`type[${i}] has no text`);
    if ((t?.label === undefined) === (t?.selector === undefined)) out.push(`type[${i}] needs a label or a selector (one of them)`);
  }
  if (s.tickMs !== undefined && !(Number.isFinite(s.tickMs) && s.tickMs >= 0)) out.push(`tickMs must be a number of ms (0 or more)`);
  if (s.user?.endsInMin !== undefined && !(Number.isFinite(s.user.endsInMin) && s.user.endsInMin > 1))
    out.push("user.endsInMin must be over 1 (the app drops a sign-in in its last minute)");
  if (s.setup !== undefined && typeof s.setup !== "function") out.push("setup must be a function of the window");
  return out.map((p) => `${s.id}: ${p}`);
}

// What's wrong with one area file's scenarios, or "" when nothing is.
function problems(area: string, list: unknown): string {
  if (!Array.isArray(list)) return `scenarios/${area}.ts doesn't export an array named scenarios.`;
  const out: string[] = [];
  for (const s of list as Scenario[]) {
    if (!s || typeof s.id !== "string") out.push("a scenario has no id");
    else {
      if (!s.id.startsWith(area + "-")) out.push(`${s.id}: the id must start with "${area}-"`);
      if (s.area !== area) out.push(`${s.id}: area is "${s.area}", the file is ${area}.ts`);
      if (!ROLES.includes(s.role)) out.push(`${s.id}: unknown role "${s.role}"`);
      if (typeof s.route !== "string") out.push(`${s.id}: no route`);
      out.push(...fieldProblems(s));
    }
  }
  const ids = (list as Scenario[]).map((s) => s?.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push(`${id}: used twice`);
  return out.join("; ");
}

async function loadArea(area: string): Promise<Scenario[]> {
  const load = loaderFor(area);
  if (!load) throw new Error(`No scenarios/${area}.ts.`);
  const mod = await load();
  const list = mod.scenarios ?? mod.default;
  const bad = problems(area, list);
  if (bad) throw new Error(bad);
  return list as Scenario[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Failure({ text }: { text: string }) {
  return (
    <main style={{ font: "16px/1.5 system-ui, sans-serif", padding: 24, color: "#b3261e" }}>
      <h1 style={{ fontSize: 20 }}>The lab couldn't open this scenario.</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
      <p><a href="?">Every scenario</a></p>
    </main>
  );
}

async function list() {
  const areas = [...new Set([...AREAS, ...Object.keys(loaders).map(areaOf)])];
  const results = await Promise.allSettled(areas.map(loadArea));
  const scenarios: ScenarioMeta[] = [];
  const errors: { area: string; message: string }[] = [];
  results.forEach((r, i) => (r.status === "fulfilled" ? scenarios.push(...r.value.map(meta)) : errors.push({ area: areas[i], message: message(r.reason) })));
  document.title = "Screen lab";
  root.render(
    <main style={{ font: "16px/1.5 system-ui, sans-serif", padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 24 }}>Screen lab: {scenarios.length} scenarios</h1>
      {errors.map((e) => (
        <p key={e.area} style={{ color: "#b3261e" }}>
          <b>{e.area}</b>: {e.message}
        </p>
      ))}
      {areas.map((area) => {
        const mine = scenarios.filter((s) => s.area === area);
        return (
          <section key={area}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>{area} ({mine.length})</h2>
            <ul style={{ marginTop: 0 }}>
              {mine.map((s) => (
                <li key={s.id}>
                  <a href={`?s=${encodeURIComponent(s.id)}`}>{s.id}</a> {s.title}{" "}
                  <small style={{ color: "#5f6368" }}>
                    #/{s.route} as {s.role}
                    {s.expect ? `, expect ${s.expect}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>,
  );
  window.__lab = { ready: true, mode: "list", scenarios, errors };
}

async function open(id: string) {
  const area = id.split("-")[0];
  const s = (await loadArea(area)).find((x) => x.id === id);
  if (!s) throw new Error(`No scenario ${id} in scenarios/${area}.ts.`);

  // tickMs moves the pinned clock, so a scenario with one and no `now` pins the real time.
  if (s.now || s.tickMs !== undefined) pinTime(s.now ?? new Date().toISOString());
  const now = Date.now();
  seedRole(s, now);
  setAuthMode(s.signIn === "refused" ? "refused" : "ok");
  setFixtures({ ...roleFixtures(s), ...s.fixtures });
  stubGoogle(s.google);
  stubCamera(s.camera ?? "fake");
  if (s.qr !== undefined) stubQr(s.qr);
  s.setup?.(window);
  window.__labTick = tick;
  const route = s.route.replace(/^#?\/?/, "").replace(/\{origin\}/g, location.origin);
  history.replaceState(null, "", `${location.pathname}?s=${encodeURIComponent(id)}#/${route}`);

  const [{ default: App }, { AuthProvider }, { ErrorBoundary }] = await Promise.all([
    import("../../src/App"),
    import("../../src/blocks/auth"),
    import("../../src/blocks/ui"),
    import("../../src/index.css"),
  ]);
  document.title = `${s.id} · lab`;
  // As src/main.tsx, without StrictMode: a live build runs each effect once.
  root.render(
    <ErrorBoundary page>
      <AuthProvider client={new ConvexReactClient("lab") as unknown as RealClient}>
        <App />
      </AuthProvider>
    </ErrorBoundary>,
  );
  for (const step of s.later ?? []) setTimeout(() => setFixtures(step.fixtures), step.afterMs);
  window.__lab = { ready: true, mode: "scenario", scenario: meta(s) };
}

const id = new URLSearchParams(location.search).get("s");
(id ? open(id) : list()).catch((e: unknown) => {
  console.error("[lab]", e);
  root.render(<Failure text={message(e)} />);
  window.__lab = { ready: true, mode: "error", message: message(e) };
});
