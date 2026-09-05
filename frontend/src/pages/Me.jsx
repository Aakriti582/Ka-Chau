import { useCallback, useEffect, useMemo, useState } from "react";
import client, { signOut } from "../api/client";
import BottomTabBar from "../components/BottomTabBar";
import SharingSheet from "../components/SharingSheet";
import { timeAgo } from "../utils/time";

const PRECISION_LABEL = {
  exact: "Exact",
  approx: "Approx",
  proximity_only: "Proximity",
};

// Most revealing first. This screen exists to answer "what am I giving away",
// so the widest access sits at the top where it can't be scrolled past.
const PRECISION_RANK = { exact: 0, approx: 1, proximity_only: 2 };
const STATE_RANK = { active: 0, paused: 1, expired: 2 };

function viewerName(share) {
  return share.viewer.display_name || share.viewer.username;
}

// /nearby/ drops expired shares, so a passed expiry means nobody is seeing you
// through it. Computed here rather than read from the serializer's is_active,
// which conflates paused with expired and is only fresh as of the response.
function shareState(share) {
  if (share.is_paused) return "paused";
  if (share.expires_at && new Date(share.expires_at) <= new Date()) return "expired";
  return "active";
}

function expiryLabel(isoString) {
  if (!isoString) return "no expiry";
  const d = new Date(isoString);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `until ${time}`;
  return `until ${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function shareMeta(share) {
  const state = shareState(share);
  if (state === "paused") return "Paused by you";
  if (state === "expired") return "Expired";
  return `${PRECISION_LABEL[share.precision] || share.precision} · ${expiryLabel(share.expires_at)}`;
}

function Identity({ me, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const name = me.display_name || me.username;

  function startEditing() {
    setValue(me.display_name || "");
    setError("");
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    const displayName = value.trim();
    if (displayName === (me.display_name || "")) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await client.patch("/me/", { display_name: displayName });
      onSaved(res.data);
      setEditing(false);
    } catch {
      setError("Couldn't save that name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-[20px] px-4 py-4.5">
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-full bg-forest text-white flex items-center justify-center font-display text-[22px] shrink-0">
          {name[0].toUpperCase()}
        </div>

        {!editing ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[25px] text-ink leading-tight truncate">{name}</div>
              <div className="text-[12.5px] text-ink-soft truncate">@{me.username}</div>
            </div>
            <button
              onClick={startEditing}
              className="text-[12.5px] text-forest border-b border-sage shrink-0"
            >
              {me.display_name ? "Edit" : "Add name"}
            </button>
          </>
        ) : (
          <form onSubmit={save} className="min-w-0 flex-1">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              maxLength={60}
              autoFocus
              aria-label="Display name"
              placeholder="Your name"
              className="w-full font-body text-base text-ink px-3.5 py-2.5 bg-card border border-border rounded-[14px] outline-none focus:border-sage"
            />
            <div className="mt-2.5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="flex-1 font-body text-sm text-ink-soft bg-card border border-border rounded-xl py-2.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 font-body text-sm text-white bg-forest rounded-xl py-2.5 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>

      {editing && (
        <>
          {error && <p className="mt-2.5 text-sm text-danger">{error}</p>}
          <p className="mt-2.5 text-[12px] text-ink-faint text-balance">
            @{me.username} stays as it is — usernames can't be changed.
          </p>
        </>
      )}

      {!editing && !me.display_name && (
        <p className="mt-3 text-[12px] text-ink-faint text-balance">
          Friends see @{me.username} until you add a display name.
        </p>
      )}
    </div>
  );
}

function ViewerRow({ share, manageable, onManage }) {
  const name = viewerName(share);
  const dimmed = shareState(share) !== "active";

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14.5px] ${dimmed ? "text-ink-faint" : "text-ink"}`}>
          {name}
        </span>
        <span className="block text-[11.5px] text-ink-faint mt-0.5">
          Started {timeAgo(share.created_at)}
        </span>
      </span>
      <span className={`text-[12.5px] shrink-0 ${dimmed ? "text-ink-faint" : "text-ink-soft"}`}>
        {shareMeta(share)}
      </span>
    </>
  );

  if (!manageable) {
    return <div className="flex items-center gap-3 px-4 py-3">{body}</div>;
  }

  return (
    <button
      onClick={() => onManage(share)}
      aria-label={`Change what ${name} can see`}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-page"
    >
      {body}
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ink-faint shrink-0"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

export default function Me() {
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState("");
  const [shares, setShares] = useState(null);
  const [sharesError, setSharesError] = useState("");
  const [friends, setFriends] = useState(null);
  const [friendsError, setFriendsError] = useState("");
  const [manageEntry, setManageEntry] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await client.get("/me/");
      setMe(res.data);
      setMeError("");
    } catch {
      setMeError("Couldn't load your profile. Check your connection.");
    }
  }, []);

  const loadShares = useCallback(async () => {
    try {
      const res = await client.get("/shares/");
      setShares(res.data);
      setSharesError("");
    } catch {
      setSharesError("Couldn't load who can see you. Check your connection.");
    }
  }, []);

  // Only to resolve the friendship behind each share: the sharing sheet needs a
  // friendship_id to act on, and /shares/ doesn't carry one.
  const loadFriends = useCallback(async () => {
    try {
      const res = await client.get("/friendships/friends/");
      setFriends(res.data);
      setFriendsError("");
    } catch {
      setFriendsError("Couldn't reach your friend list, so these can't be changed from here yet.");
    }
  }, []);

  useEffect(() => {
    loadMe();
    loadShares();
    loadFriends();
  }, [loadMe, loadShares, loadFriends]);

  const sortedShares = useMemo(() => {
    if (!shares) return null;
    return [...shares].sort((a, b) => {
      const state = STATE_RANK[shareState(a)] - STATE_RANK[shareState(b)];
      if (state !== 0) return state;
      const precision = (PRECISION_RANK[a.precision] ?? 9) - (PRECISION_RANK[b.precision] ?? 9);
      if (precision !== 0) return precision;
      return viewerName(a).localeCompare(viewerName(b));
    });
  }, [shares]);

  const activeCount = useMemo(
    () => (shares ? shares.filter((s) => shareState(s) === "active").length : 0),
    [shares]
  );

  const manageableIds = useMemo(() => new Set((friends ?? []).map((f) => f.user.id)), [friends]);

  function openManage(share) {
    const entry = friends?.find((f) => f.user.id === share.viewer.id);
    if (entry) setManageEntry({ ...entry, my_share: share });
  }

  // The sheet can revoke, re-create, pause or retime a share, so reconcile by
  // viewer rather than by share id — a revoked-then-restored share is a new row.
  function handleShareChange(viewerId, newShare) {
    setShares((list) => {
      if (!list) return list;
      const rest = list.filter((s) => s.viewer.id !== viewerId);
      return newShare ? [...rest, newShare] : rest;
    });
    setFriends((fs) =>
      fs ? fs.map((f) => (f.user.id === viewerId ? { ...f, my_share: newShare } : f)) : fs
    );
    setManageEntry((e) => (e ? { ...e, my_share: newShare } : e));
  }

  // Removing a friend clears the shares in both directions server-side.
  function handleRemoved(friendshipId) {
    const removed = friends?.find((f) => f.friendship_id === friendshipId);
    setFriends((fs) => (fs ? fs.filter((f) => f.friendship_id !== friendshipId) : fs));
    if (removed) {
      setShares((list) => (list ? list.filter((s) => s.viewer.id !== removed.user.id) : list));
    }
    setManageEntry(null);
  }

  return (
    <div className="min-h-screen bg-page font-body pb-24">
      <div className="max-w-lg mx-auto px-5">
        <h1 className="font-display font-medium text-3xl text-ink pt-6 pb-3">Me</h1>

        {!me && !meError && <p className="text-ink-soft text-sm">Loading…</p>}

        {meError && (
          <div className="bg-card border border-border rounded-[20px] px-4 py-6 text-center">
            <p className="text-ink-soft text-sm">{meError}</p>
          </div>
        )}

        {me && <Identity me={me} onSaved={setMe} />}

        <section className="mt-5 bg-card border border-border rounded-[20px] overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[21px] text-ink">Who can see you</h2>
            {shares?.length > 0 && (
              <span className="text-[11px] tracking-[.1em] uppercase text-ink-soft shrink-0">
                {activeCount === 0 ? "None active" : `${activeCount} active`}
              </span>
            )}
          </div>

          {!shares && !sharesError && <p className="px-4 pb-4 text-sm text-ink-soft">Loading…</p>}

          {sharesError && <p className="px-4 pb-4 text-sm text-ink-soft">{sharesError}</p>}

          {shares?.length === 0 && (
            <div className="px-4 pb-5">
              <p className="text-[15px] text-ink">Nobody can see your location right now.</p>
              <p className="mt-1 text-[12.5px] text-ink-soft text-balance">
                Sharing only starts when you turn it on for a friend, from the Friends tab.
              </p>
            </div>
          )}

          {shares?.length > 0 && (
            <>
              {activeCount === 0 && (
                <p className="px-4 pb-3 text-[13px] text-ink-soft">
                  Nobody can see your location right now.
                </p>
              )}
              <div className="border-t border-[#eff1ef] divide-y divide-[#eff1ef]">
                {sortedShares.map((share) => (
                  <ViewerRow
                    key={share.id}
                    share={share}
                    manageable={manageableIds.has(share.viewer.id)}
                    onManage={openManage}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {shares?.length > 0 && (
          <p className="mt-2.5 px-1 text-[11.5px] text-ink-faint text-balance">
            {friendsError || "Tap anyone to change what they see, pause them, or stop sharing."}
          </p>
        )}

        <button
          onClick={signOut}
          className="w-full mt-5 font-body text-[15px] text-danger bg-transparent border border-danger-border rounded-[15px] py-3.5"
        >
          Sign out
        </button>
        <p className="mt-3 text-[11.5px] text-ink-faint text-center text-balance">
          Signing out doesn't change who can see you.
        </p>
      </div>

      <SharingSheet
        entry={manageEntry}
        onClose={() => setManageEntry(null)}
        onShareChange={(newShare) => handleShareChange(manageEntry.user.id, newShare)}
        onRemoved={handleRemoved}
      />

      <BottomTabBar />
    </div>
  );
}
