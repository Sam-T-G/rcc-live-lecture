// The professor key on the client. Typed once, kept in this browser, and sent with every
// host-only call, so the professor pages work without Google sign-in.
// <ProfGate> shows its children to a Google host or anyone with the right key.
import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Screen, Status } from "../../blocks/ui";

const STORE = "rcc-live:prof-key";
const listeners = new Set<() => void>();

function read(): string | undefined {
  try { return localStorage.getItem(STORE) || undefined; } catch { return undefined; }
}
export function setProfKey(key: string | null) {
  try { if (key) localStorage.setItem(STORE, key); else localStorage.removeItem(STORE); } catch { /* private mode: key lasts until reload */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Demo only: the same key as DEMO_KEY in convex/checkin/prof.ts, used when none is saved, so
// the professor pages open with nothing to type. Delete both after the 10-29 demos.
const DEMO_KEY = "gdg-demo-1029";

// The saved key, else the demo key. Pass it as `key` to every host-only function.
export function useProfKey() {
  return useSyncExternalStore(subscribe, read) ?? DEMO_KEY;
}

export function ProfGate({ title, children }: { title: string; children: ReactNode }) {
  const key = useProfKey();
  const host = useQuery(api.checkin.pass.amHost, { key });
  const [typed, setTyped] = useState("");

  if (host) return <>{children}</>;
  if (host === undefined) return <Screen title={title} wide><Status kind="loading">Checking…</Status></Screen>;

  function save(e: FormEvent) {
    e.preventDefault();
    if (typed.trim()) setProfKey(typed.trim());
    setTyped("");
  }
  return (
    <Screen title={title} wide>
      <Card title="Professor key">
        <form className="row" onSubmit={save}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Professor key" aria-label="Professor key" autoCapitalize="none" autoComplete="off" />
          <button type="submit">Open</button>
        </form>
        {key && <Status kind="error">That key didn’t work.</Status>}
      </Card>
    </Screen>
  );
}
