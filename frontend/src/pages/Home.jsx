import { useCallback, useEffect, useState } from "react";
import client, { tokens } from "../api/client";
import useLocationReporter from "../hooks/useLocationReporter";
import FriendRow from "../components/FriendRow";
import { timeAgo } from "../utils/time";

const POLL_MS = 30_000;

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { status, lastSent, error: locError } = useLocationReporter();

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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <header className="flex justify-between items-center mb-1">
          <h1 className="text-2xl font-semibold text-slate-900">Ka Chau?</h1>
          <button
            onClick={() => { tokens.clear(); window.location.href = "/login"; }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </header>

        <p className="text-xs text-slate-400 mb-6">
          {status === "denied"
            ? "Location off — others can't see you"
            : lastSent
            ? `Your location updated ${timeAgo(lastSent.toISOString())}`
            : "Getting your location…"}
        </p>

        {locError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800
                          text-sm rounded-lg px-3 py-2 mb-4">
            {locError}
          </div>
        )}

        {error && (
          <div className="bg-white border border-slate-200 rounded-xl
                          px-4 py-6 text-center">
            <p className="text-slate-600 text-sm">{error}</p>
          </div>
        )}

        {loading && !data && (
          <p className="text-slate-400 text-sm">Loading…</p>
        )}

        {data && (
          <>
            {data.nearby.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200
                                  px-4 divide-y divide-slate-100 mb-4">
                {data.nearby.map((f) => (
                  <FriendRow key={f.user.id} friend={f} />
                ))}
              </section>
            )}

            {data.nearby.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl
                              px-4 py-8 text-center mb-4">
                <p className="text-slate-900 font-medium mb-1">
                  {counts.sharing_with_me === 0
                    ? counts.paused > 0
                      ? "Sharing is paused"
                      : "Nobody is sharing with you"
                    : "No one nearby"}
                </p>
                <p className="text-slate-500 text-sm">
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
                <h2 className="text-xs font-medium text-slate-400 uppercase
                               tracking-wide mb-2 px-1">
                  Not updating
                </h2>
                <div className="bg-white rounded-xl border border-slate-200
                                px-4 divide-y divide-slate-100">
                  {data.stale.map((f) => (
                    <FriendRow key={f.user.id} friend={f} stale />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}