// Presence diffing over two /api/nearby/ payloads. Pure and toast-agnostic, so
// the Map screen can reuse it without inheriting any of the UI around it.

// nearby keeps whole entries, because a departure has to be described using the
// last thing we knew about someone who is no longer in the payload at all.
export function snapshot(data) {
  const nearby = new Map();
  const stale = new Set();

  for (const entry of data?.nearby ?? []) {
    nearby.set(entry.user.id, entry);
  }
  for (const entry of data?.stale ?? []) {
    stale.add(entry.user.id);
  }

  return { nearby, stale };
}

// Returns [] when there is no previous observation: on the first poll everyone
// is new, and the caller seeds silently rather than firing a burst.
export function diffPresence(previous, current) {
  if (!previous) return [];

  const events = [];

  for (const [id, entry] of current.nearby) {
    if (!previous.nearby.has(id)) {
      events.push({ type: "arrived", user: entry.user, entry });
    }
  }

  for (const [id, entry] of previous.nearby) {
    // Moving to `stale` is not leaving. Their phone stopped reporting, which is
    // a different fact about a person who may well still be standing next to
    // you, so it deliberately fires nothing.
    if (!current.nearby.has(id) && !current.stale.has(id)) {
      events.push({ type: "left", user: entry.user, entry: null });
    }
  }

  return events;
}
