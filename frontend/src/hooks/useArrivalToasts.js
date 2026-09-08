import { useCallback, useEffect, useRef, useState } from "react";
import { diffPresence, snapshot } from "../utils/presence";

const VISIBLE_MS = 5000;
const MAX_VISIBLE = 3;

// Someone sitting on the 2 km boundary can cross it on every poll. Announcing
// each crossing would be noise, so a given person and event stays quiet for
// this long after being announced.
const REPEAT_SUPPRESSION_MS = 5 * 60 * 1000;

export default function useArrivalToasts(data) {
  const [toasts, setToasts] = useState([]);
  const previous = useRef(null);
  const announced = useRef(new Map());
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    // A poll that failed leaves data null. That is missing information, not an
    // empty area, so the last real observation is kept to compare against
    // rather than being read as everybody leaving at once.
    if (!data) return;

    const current = snapshot(data);
    const events = diffPresence(previous.current, current);
    previous.current = current;
    if (events.length === 0) return;

    const now = Date.now();
    const fresh = [];
    for (const event of events) {
      const key = `${event.type}:${event.user.id}`;
      const last = announced.current.get(key);
      if (last != null && now - last < REPEAT_SUPPRESSION_MS) continue;
      announced.current.set(key, now);
      nextId.current += 1;
      fresh.push({ ...event, id: nextId.current });
    }
    if (fresh.length === 0) return;

    setToasts((list) => [...list, ...fresh].slice(-MAX_VISIBLE));

    // Scheduled per toast at creation. A shared effect keyed on the list would
    // restart every countdown each time another toast arrived, so a steady
    // trickle would leave the earlier ones on screen indefinitely.
    for (const toast of fresh) {
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), VISIBLE_MS)
      );
    }
  }, [data, dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { toasts, dismiss };
}
