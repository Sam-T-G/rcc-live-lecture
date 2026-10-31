// Block: routing. Hash URLs (#/kiosk/ABC) so GitHub Pages serves every page from one file.
// Add a page in src/pages/index.ts; read its parts with useRoute() and the part after "?" with
// useHashParams().
import { useEffect, useMemo, useState, type ReactNode } from "react";

// The parts of the path in the hash, decoded: #/checkin/stage?deck=x gives ["checkin", "stage"].
// A part with a bad %-escape (#/live/%E0%A4%A) can't be decoded, so the whole path comes back as
// one part. No page has that name, so App shows "No page" instead of a blank screen.
function readRoute() {
  const path = location.hash.replace(/^#\/?/, "").split("?")[0] || "";
  const parts = path.split("/").filter(Boolean);
  try {
    return parts.map(decodeURIComponent);
  } catch {
    return [path];
  }
}

export function useRoute() {
  const [parts, setParts] = useState(readRoute);
  useEffect(() => {
    const on = () => setParts(readRoute());
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

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <a href={"#/" + to.replace(/^\/+/, "")} className={className}>{children}</a>;
}
