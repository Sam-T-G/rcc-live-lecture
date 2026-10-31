// The link that opens #/checkin/stage, read by Stage.tsx (its header comment lists the parameters).
// Only the stage uses these; Stage.test.ts tests them.

// What ?bridge= says in the address bar once the page has saved the key. deck-bridge.js needs a
// "<channel>.<key>" value with a dot, so no real bridge value can be this word.
export const SAVED = "saved";

// This tab's copy of the bridge key. sessionStorage, so it ends when the tab closes.
const STORE = "rcc-live:stage-bridge";

// Hosts a browser loads over http even inside an https page, so their decks keep http.
const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

// The deck's address from ?deck=, or null when it can't load one. "https://" goes in front when the
// address has no scheme ("slides.example.com/deck"). Only http and https addresses load, and the
// host has to be localhost, an IPv6 address or a name with a dot between two non-empty parts, so
// ":::", "decks/week9/", "../decks/week9/" (its host would be "..") and "javascript:..." give null.
// With `onHttps` (this page is on https, like the live site), an http deck other than localhost,
// 127.0.0.1 or [::1] gets https instead, since the browser blocks an http frame on an https page.
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
  if (host !== "localhost" && !/^[^.]+(\.[^.]+)+$/.test(host) && !host.startsWith("[")) return null;
  if (onHttps && url.protocol === "http:" && !LOCAL.includes(host)) url.protocol = "https:";
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

// The bridge key this tab saved from an earlier link, or null.
export function savedBridge(): string | null {
  try {
    return sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
}

// When the address bar has #/checkin/stage?bridge=<channel>.<key>, saves the key in this tab and
// puts ?bridge=saved in the address bar in its place (one ?bridge=, where the first one was), so
// the key never shows on the projector and a reload still finds it. The key is the last ?bridge=
// that isn't "saved" or empty (bridgeIn). Returns the key, or null when the link has none. When the browser won't
// store it (storage blocked), the key stays in the address bar, so a reload still has it. Any other
// page's link is left alone (the hash can change to another page before the stage closes).
export function takeBridge(): string | null {
  const at = location.hash.indexOf("?");
  const path = (at === -1 ? location.hash : location.hash.slice(0, at)).replace(/^#/, "").split("/").filter(Boolean).join("/");
  if (path !== "checkin/stage") return null;
  const key = at === -1 ? null : bridgeIn(new URLSearchParams(location.hash.slice(at + 1)));
  if (!key || key === SAVED) return null;
  try {
    sessionStorage.setItem(STORE, key);
    if (sessionStorage.getItem(STORE) !== key) return key;
    history.replaceState(history.state, "", location.pathname + location.search + hashWith(location.hash, "bridge", SAVED));
  } catch {
    // Storage or the address bar refused: the key stays in the link.
  }
  return key;
}
