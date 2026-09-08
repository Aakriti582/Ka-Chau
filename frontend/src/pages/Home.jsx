import { useCallback, useEffect, useState } from "react";
import client, { signOut } from "../api/client";
import useLocationReporter from "../hooks/useLocationReporter";
import FriendRow from "../components/FriendRow";
import BottomTabBar from "../components/BottomTabBar";
import ArrivalToasts from "../components/ArrivalToasts";
import useArrivalToasts from "../hooks/useArrivalToasts";
import { timeAgo } from "../utils/time";

const POLL_MS = 30_000;

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { status, lastSent, error: locError } = useLocationReporter();

  // Reads the same polled payload the list renders; it does not poll itself.
  const { toasts, dismiss } = useArrivalToasts(data);

  const load = useCallback(async () => {
    try {
      const res = await client.get("/nearby/");
      setData(res.data);
      setError("");
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.detail);
        setData(null);
      } else {
        setError("Couldn't load. Check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (lastSent) load();
  }, [lastSent, load]);

  const counts = data?.counts;

  return (
    <div className="min-h-screen bg-page font-body pb-24">
      <div className="max-w-lg mx-auto px-5 py-6">
        <header className="flex justify-between items-center mb-4">
          <h1 className="font-display font-medium text-3xl text-ink">Nearby</h1>
          <button
            onClick={signOut}
            className="text-sm text-ink-soft hover:text-forest"
          >
            Sign out
          </button>
        </header>

        <ArrivalToasts toasts={toasts} onDismiss={dismiss} />

        <div
          className={`flex items-center gap-2.5 rounded-[18px] border px-4 py-3.5 mb-4 ${
            status === "denied" ? "border-border bg-card" : "border-[#c6dcc9] bg-[#f1f6f1]"
          }`}
        >
          <span
            className={`w-[9px] h-[9px] rounded-full shrink-0 ${
              status === "denied" ? "bg-ink-faint" : "bg-sage"
            }`}
          />
          <span className={`text-sm ${status === "denied" ? "text-ink-soft" : "text-forest"}`}>
            {status === "denied"
              ? "Location off — others can't see you"
              : lastSent
              ? `Your location updated ${timeAgo(lastSent.toISOString())}`
              : "Getting your location…"}
          </span>
        </div>

        {locError && (
          <div className="bg-amber-bg border border-amber-border text-amber-ink
                          text-sm rounded-2xl px-4 py-3 mb-4">
            {locError}
          </div>
        )}

        {error && (
          <div className="bg-card border border-border rounded-2xl
                          px-4 py-6 text-center">
            <p className="text-ink-soft text-sm">{error}</p>
          </div>
        )}

        {loading && !data && (
          <p className="text-ink-soft text-sm">Loading…</p>
        )}

        {data && (
          <>
            {data.nearby.length > 0 && (
              <section className="bg-card rounded-[20px] border border-border
                                  px-4 divide-y divide-[#eff1ef] mb-4">
                {data.nearby.map((f) => (
                  <FriendRow key={f.user.id} friend={f} />
                ))}
              </section>
            )}

            {data.nearby.length === 0 && (
              <div className="bg-card border border-border rounded-2xl
                              px-4 py-8 text-center mb-4">
                <p className="font-display text-xl text-ink mb-1">
                  {counts.sharing_with_me === 0
                    ? counts.paused > 0
                      ? "Sharing is paused"
                      : "Nobody is sharing with you"
                    : "No one nearby"}
                </p>
                <p className="text-ink-soft text-sm">
                  {counts.sharing_with_me === 0
                    ? counts.paused > 0
                      ? `${counts.paused} friend${counts.paused > 1 ? "s have" : " has"} paused sharing.`
                      : "Ask a friend to share their location with you."
                    : `${counts.sharing_with_me} friend${counts.sharing_with_me > 1 ? "s are" : " is"} sharing, but no one is within 2 km.`}
                </p>
              </div>
            )}

            {data.stale.length > 0 && (
              <section>
                <h2 className="text-[11px] font-medium text-ink-soft uppercase
                               tracking-[.14em] mb-2 px-1">
                  Not updating
                </h2>
                <div className="bg-card rounded-[20px] border border-border
                                px-4 divide-y divide-[#eff1ef]">
                  {data.stale.map((f) => (
                    <FriendRow key={f.user.id} friend={f} stale />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <BottomTabBar />
    </div>
  );
}