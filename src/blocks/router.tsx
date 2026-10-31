// Block: routing. Hash URLs (#/kiosk/ABC) so GitHub Pages serves every page from one file.
// Add a page in src/pages/index.ts; read its parts with useRoute() and the part after "?" with
// useHashParams().
import { useEffect, useMemo, useState, type ReactNode } from "react";

export function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "").split("/").filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

// The part of the hash after the first "?": on #/checkin/stage?deck=a&bridge=b,
// useHashParams().get("deck") is "a". It reads the hash again on every hashchange and returns
// the same URLSearchParams object until the hash changes.
export function useHashParams() {
  const read = () => {
    const at = location.hash.indexOf("?");
    return at === -1 ? "" : location.hash.slice(at + 1);
  };
  const [query, setQuery] = useState(read);
  useEffect(() => {
    const on = () => setQuery(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return useMemo(() => new URLSearchParams(query), [query]);
}

export function go(path: string) {
  location.hash = "#/" + path.replace(/^\/+/, "");
}

// The full URL of a page in this app, for a QR code or a link someone else opens.
export function pageUrl(path: string) {
  return location.origin + location.pathname + "#/" + path.replace(/^\/+/, "");
}

export function Link({ to, children }: { to: string; children: ReactNode }) {
  return <a href={"#/" + to.replace(/^\/+/, "")}>{children}</a>;
}
