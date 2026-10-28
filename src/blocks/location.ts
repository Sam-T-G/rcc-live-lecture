// Block: phone location. Call request() from a button press (iOS only asks then), over
// HTTPS or localhost. Accuracy is in meters; indoors it is often 20 to 100 m.
// Check distance on the server with metersBetween() from convex/lib.ts, never trust the client.
import { useCallback, useState } from "react";

export type Fix = { lat: number; lng: number; accuracyM: number; at: number };

export function useLocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = useCallback(
    () =>
      new Promise<Fix>((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          const m = "This browser can't share location.";
          setError(m);
          return reject(new Error(m));
        }
        setBusy(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: p.timestamp };
            setFix(f);
            setBusy(false);
            resolve(f);
          },
          (e) => {
            const m = e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow it in the browser settings." : "Couldn't get a location. Try again.";
            setError(m);
            setBusy(false);
            reject(new Error(m));
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
        );
      }),
    [],
  );

  return { fix, error, busy, request };
}
