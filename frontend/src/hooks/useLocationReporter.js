import { useEffect, useRef, useState } from "react";
import client from "../api/client";

const MIN_INTERVAL_MS = 60_000;

export default function useLocationReporter(enabled = true) {
  const [status, setStatus] = useState("idle");
  const [lastSent, setLastSent] = useState(null);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState("");
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setError("This browser doesn't support location.");
      return;
    }

    setStatus("watching");

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        // Exposed on every fix so the map can follow the user. Only the POST
        // below is throttled -- rate-limiting the server, not the UI.
        setCoords({ latitude, longitude, accuracy });

        const now = Date.now();
        if (now - lastSentAt.current < MIN_INTERVAL_MS) return;
        lastSentAt.current = now;

        try {
          await client.post("/locations/", {
            latitude,
            longitude,
            accuracy_m: accuracy,
          });
          setLastSent(new Date());
          setError("");
        } catch (err) {
          setError("Couldn't send your location.");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setError("Location permission denied.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus("unavailable");
          setError("Your position couldn't be determined.");
        } else {
          setStatus("error");
          setError("Location timed out.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return { status, lastSent, error, coords };
}