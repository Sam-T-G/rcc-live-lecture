// The link that opens #/checkin/stage, read by Stage.tsx (its header comment lists the parameters).
// Only the stage uses these; Stage.test.ts tests them.

// What ?bridge= says in the address bar once the page has saved the key. deck-bridge.js needs a
// "<channel>.<key>" value with a dot, so no real bridge value can be this word.
export const SAVED = "saved";

// This tab's copy of the bridge key and the origin of the deck it came with, as JSON
// ({ key, origin }). sessionStorage, so it ends when the tab closes.
const STORE = "rcc-live:stage-bridge";

// Hosts a browser loads over http even inside an https page (localhost, any name ending in
// .localhost, 127.x.x.x and [::1]), so their decks keep http. URL writes any IPv4 host as four
// numbers, so "127.example.com" isn't one.
function isLocal(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || /^127(\.\d+){3}$/.test(host) || host === "[::1]";
}

// The deck's address from ?deck=, or null when it can't load one. "https://" goes in front when the
// address has no scheme ("slides.example.com/deck"). Only http and https addresses load, and the
// host has to be localhost, an IPv6 address or a name with a dot between two non-empty parts (one
// trailing dot allowed, as in "slides.example.com."), so ":::", "decks/week9/", "../decks/week9/"
// (its host would be "..") and "javascript:..." give null. With `onHttps` (this page is on https,
// like the live site), an http deck on any host but those isLocal lists gets https instead, since
// the browser blocks an http frame on an https page.
export function deckAddress(raw: string, onHttps = false): URL | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : "https://" + text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname;
  if (host !== "localhost" && !/^[^.]+(\.[^.]+)+\.?$/.test(host) && !host.startsWith("[")) return null;
  if (onHttps && url.protocol === "http:" && !isLocal(host)) url.protocol = "https:";
  return url;
}

// The iframe's address: the deck with ?bridge= and ?bridge-site= set, which deck-bridge.js reads
// from the deck's own address.
export function frameSrc(deck: URL, bridge: string | null, site: string | null): string {
  const url = new URL(deck);
  if (bridge) url.searchParams.set("bridge", bridge);
  if (site) url.searchParams.set("bridge-site", site);
  return url.toString();
}

// The decoded name of one "name=value" part of a query.
function nameOf(part: string): string {
  const raw = part.split("=")[0];
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

// The hash with ?<name>= set to `value` where it was first, and any later ?<name>= dropped. The
// other parameters stay as they were typed.
function hashWith(hash: string, name: string, value: string): string {
  const at = hash.indexOf("?");
  if (at === -1) return hash;
  let done = false;
  const parts = hash
    .slice(at + 1)
    .split("&")
    .flatMap((part) => {
      if (nameOf(part) !== name) return [part];
      if (done) return [];
      done = true;
      return [`${name}=${encodeURIComponent(value)}`];
    });
  return hash.slice(0, at + 1) + parts.join("&");
}

// The ?bridge= value the stage uses: the last one in the link that's a key (not "saved" and not
// empty), so a key added after ?bridge=saved counts. With no key, "saved" when the link says so,
// else null.
export function bridgeIn(params: URLSearchParams): string | null {
  const all = params.getAll("bridge");
  const keys = all.filter((v) => v && v !== SAVED);
  return keys[keys.length - 1] ?? (all.includes(SAVED) ? SAVED : null);
}

// The bridge key this tab saved from an earlier link, with the origin of the deck that link named,
// or null. The origin is null while the key waits for a deck (its link had no ?deck= that loads):
// keyFor gives a waiting key to no deck, and takeBridge saves it with the origin of the first
// ?deck= that loads in this tab. A value saved by an older version (the key alone) counts as
// none, since it has no origin.
export type Saved = { key: string; origin: string | null };
export function savedBridge(): Saved | null {
  try {
    const s: unknown = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    if (!s || typeof s !== "object") return null;
    const { key, origin } = s as Record<string, unknown>;
    return typeof key === "string" && key && (origin === null || typeof origin === "string") ? { key, origin } : null;
  } catch {
    return null;
  }
}

// The saved key for this deck: only when the deck is on the origin the key came with, so a later
// ?bridge=saved link that names another deck (a link someone sent, a site that isn't a deck-kit
// deck) never gets it in its address, where that site's logs or script could read it.
export function keyFor(saved: Saved | null, deck: URL | null): string | null {
  return saved && saved.origin !== null && deck && deck.origin === saved.origin ? saved.key : null;
}

// The deck a waiting key goes to (Saved): a saved key with no origin and a deck that loads gives
// that key with the deck's origin; anything else comes back as it was.
export function bindTo(saved: Saved | null, deck: URL | null): Saved | null {
  return saved && saved.origin === null && deck ? { key: saved.key, origin: deck.origin } : saved;
}

// Saves `value` in this tab. False when the browser won't store it (storage blocked).
function store(value: Saved): boolean {
  const text = JSON.stringify(value);
  try {
    sessionStorage.setItem(STORE, text);
    return sessionStorage.getItem(STORE) === text;
  } catch {
    return false;
  }
}

// When the address bar has #/checkin/stage?bridge=<channel>.<key>, saves the key in this tab, with
// the origin of the link's ?deck= (keyFor hands the key only to a deck there), and puts
// ?bridge=saved in the address bar in its place (one ?bridge=, where the first one was), so the key
// never shows on the projector and a reload still finds it. The key is the last ?bridge= that isn't
// "saved" or empty (bridgeIn). With no ?deck= that loads, the key is saved with no origin and waits:
// the stage says to add ?deck=, and when the professor does, the hash change (?bridge=saved and a
// ?deck= that loads) saves the key with that deck's origin (bindTo), once. Returns the key taken
// or bound, or null when there is none. When the browser won't store it, the key stays in the
// address bar, so a reload still has it. Any other page's link is left alone (the hash can change
// to another page before the stage closes).
export function takeBridge(): string | null {
  const at = location.hash.indexOf("?");
  const path = (at === -1 ? location.hash : location.hash.slice(0, at)).replace(/^#/, "").split("/").filter(Boolean).join("/");
  if (path !== "checkin/stage") return null;
  const params = new URLSearchParams(at === -1 ? "" : location.hash.slice(at + 1));
  const key = bridgeIn(params);
  if (!key) return null;
  const deck = deckAddress(params.get("deck") ?? "", location.protocol === "https:");
  if (key === SAVED) {
    const saved = savedBridge();
    const bound = bindTo(saved, deck);
    return bound && bound !== saved && store(bound) ? bound.key : null;
  }
  if (!store({ key, origin: deck?.origin ?? null })) return key; // the key stays in the link
  try {
    history.replaceState(history.state, "", location.pathname + location.search + hashWith(location.hash, "bridge", SAVED));
  } catch {
    // The address bar refused: the key stays in the link.
  }
  return key;
}
