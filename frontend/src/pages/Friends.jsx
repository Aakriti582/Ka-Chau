import { useCallback, useEffect, useState } from "react";
import client from "../api/client";
import BottomTabBar from "../components/BottomTabBar";
import SharingSheet from "../components/SharingSheet";
import { timeAgo } from "../utils/time";

const PRECISION_LABEL = {
  exact: "exact",
  approx: "approximate",
  proximity_only: "proximity only",
};

function expiryLabel(isoString) {
  if (!isoString) return "no expiry";
  const d = new Date(isoString);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `until ${time}`;
  return `until ${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function shareStatus(share) {
  if (!share) return "Not sharing with you";
  if (share.is_paused) return "Sharing paused by you";
  const precision = PRECISION_LABEL[share.precision] || share.precision;
  return `You share ${precision} · ${expiryLabel(share.expires_at)}`;
}

function initials(name) {
  return name[0].toUpperCase();
}

function FriendListRow({ entry, onManage }) {
  const name = entry.user.display_name || entry.user.username;
  const inactive = !entry.my_share || entry.my_share.is_paused;

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-[18px] px-4 py-3.5">
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-display text-lg ${
          inactive ? "bg-border text-ink-faint" : "bg-forest text-white"
        }`}
      >
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-base ${inactive ? "text-ink-soft" : "text-ink"}`}>{name}</div>
        <div className={`text-[12.5px] mt-0.5 ${inactive ? "text-ink-faint" : "text-ink-soft"}`}>
          {shareStatus(entry.my_share)}
        </div>
      </div>
      <button
        onClick={() => onManage(entry)}
        className="text-[12.5px] text-forest border-b border-sage shrink-0"
      >
        Manage
      </button>
    </div>
  );
}

function RequestRow({ request, onAccept, onReject, busy }) {
  const name = request.from_user.display_name || request.from_user.username;

  return (
    <div className="bg-card border border-border rounded-[18px] p-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-teal text-white flex items-center justify-center font-display text-lg shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base text-ink">{name}</div>
          <div className="text-[12.5px] text-ink-soft mt-0.5">
            @{request.from_user.username} · sent {timeAgo(request.created_at)}
          </div>
        </div>
      </div>
      <div className="flex gap-2.5 mt-3.5">
        <button
          onClick={() => onAccept(request)}
          disabled={busy}
          className="flex-1 font-body text-sm text-white bg-forest rounded-[13px] py-3 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(request)}
          disabled={busy}
          className="flex-1 font-body text-sm text-danger bg-transparent border border-danger-border rounded-[13px] py-3 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] text-ink-faint text-balance">
        Accepting starts at <em>proximity only</em>. You choose what they see afterwards.
      </p>
    </div>
  );
}

function SentRequestRow({ request, onCancel, busy }) {
  const name = request.to_user.display_name || request.to_user.username;

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-[18px] px-4 py-3.5">
      <div className="w-11 h-11 rounded-full bg-sage text-white flex items-center justify-center font-display text-lg shrink-0">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base text-ink">{name}</div>
        <div className="text-[12.5px] text-ink-soft mt-0.5">
          @{request.to_user.username} · sent {timeAgo(request.created_at)}
        </div>
      </div>
      <button
        onClick={() => onCancel(request)}
        disabled={busy}
        className="text-[12.5px] text-ink-soft bg-card border border-border rounded-xl px-3.5 py-2 shrink-0 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

function RequestSection({ title, className = "", items, error, emptyText, note, children }) {
  return (
    <section className={className}>
      <div className="text-[11px] tracking-[.14em] uppercase text-ink-soft mb-2.5">{title}</div>

      {error && <p className="text-sm text-danger mb-2.5">{error}</p>}
      {items?.length === 0 && <p className="text-[12.5px] text-ink-faint">{emptyText}</p>}

      {items?.length > 0 && (
        <>
          {children}
          {note && <p className="mt-2.5 text-[11.5px] text-ink-faint text-balance">{note}</p>}
        </>
      )}
    </section>
  );
}

function RequestsPanel({
  incoming,
  incomingError,
  sent,
  sentError,
  onAccept,
  onReject,
  onCancel,
  busyId,
}) {
  // Hold the single "Loading…" until both lists have settled, so neither
  // section renders an empty state while the other is still in flight.
  if ((!incoming && !incomingError) || (!sent && !sentError)) {
    return <p className="text-ink-soft text-sm">Loading…</p>;
  }
  if (!incomingError && !sentError && incoming?.length === 0 && sent?.length === 0) {
    return <p className="text-ink-soft text-sm text-center py-8">No pending requests.</p>;
  }

  return (
    <div>
      <RequestSection
        title="Incoming"
        items={incoming}
        error={incomingError}
        emptyText="Nothing is waiting on you right now."
      >
        <div className="flex flex-col gap-3">
          {incoming?.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              onAccept={onAccept}
              onReject={onReject}
              busy={busyId === r.id}
            />
          ))}
        </div>
      </RequestSection>

      <RequestSection
        className="mt-6 pt-5 border-t border-border"
        title="Sent"
        items={sent}
        error={sentError}
        emptyText="You haven't sent any requests."
        note="Cancelling withdraws the request — you can always send a new one later."
      >
        <div className="flex flex-col gap-2.5">
          {sent?.map((r) => (
            <SentRequestRow key={r.id} request={r} onCancel={onCancel} busy={busyId === r.id} />
          ))}
        </div>
      </RequestSection>
    </div>
  );
}

function AddPanel({ onSent }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(e) {
    e.preventDefault();
    const value = username.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const res = await client.get("/friendships/find/", { params: { username: value } });
      setResult(res.data);
      setSearched(true);
    } catch {
      setError("Couldn't search right now.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    setBusy(true);
    setError("");
    try {
      await client.post("/friendships/", { username: result.user.username });
      setResult((r) => ({ ...r, existing_status: "pending" }));
      onSent();
    } catch {
      setError("Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={find} className="flex flex-col gap-1.5">
        <span className="text-xs tracking-[.1em] uppercase text-ink-soft">Exact username</span>
        <div className="flex gap-2">
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setSearched(false);
              setResult(null);
            }}
            className="flex-1 font-body text-base text-ink px-4 py-3.5 bg-card border border-border rounded-[14px] outline-none focus:border-sage"
          />
          <button
            type="submit"
            disabled={busy || !username.trim()}
            className="px-5 rounded-[14px] bg-forest text-white text-sm disabled:opacity-40"
          >
            Find
          </button>
        </div>
      </form>
      <p className="mt-2 text-xs text-ink-faint text-balance">
        No browsing, no suggestions — you can only find someone if you already know their username.
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {searched && result && !result.found && (
        <p className="mt-4 text-sm text-ink-soft text-center py-4">No one found with that username.</p>
      )}

      {searched && result?.found && (
        <div className="mt-4 bg-card border border-border rounded-[18px] p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-sage text-white flex items-center justify-center font-display text-lg shrink-0">
            {initials(result.user.display_name || result.user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base text-ink">{result.user.display_name || result.user.username}</div>
            <div className="text-[12.5px] text-ink-soft mt-0.5">@{result.user.username}</div>
          </div>
          {result.existing_status == null && (
            <button
              onClick={sendRequest}
              disabled={busy}
              className="text-[13px] text-white bg-forest rounded-xl px-4 py-2.5 shrink-0 disabled:opacity-50"
            >
              Request
            </button>
          )}
          {result.existing_status === "pending" && (
            <span className="text-[12.5px] text-ink-faint shrink-0">Request pending</span>
          )}
          {result.existing_status === "accepted" && (
            <span className="text-[12.5px] text-ink-faint shrink-0">Already friends</span>
          )}
          {result.existing_status && !["pending", "accepted"].includes(result.existing_status) && (
            <span className="text-[12.5px] text-ink-faint shrink-0">{result.existing_status}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Friends() {
  const [friends, setFriends] = useState(null);
  const [friendsError, setFriendsError] = useState("");
  const [incoming, setIncoming] = useState(null);
  const [incomingError, setIncomingError] = useState("");
  const [sent, setSent] = useState(null);
  const [sentError, setSentError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [tab, setTab] = useState("friends");
  const [manageEntry, setManageEntry] = useState(null);

  const loadFriends = useCallback(async () => {
    try {
      const res = await client.get("/friendships/friends/");
      setFriends(res.data);
      setFriendsError("");
    } catch {
      setFriendsError("Couldn't load your friends. Check your connection.");
    }
  }, []);

  const loadIncoming = useCallback(async () => {
    try {
      const res = await client.get("/friendships/pending/");
      setIncoming(res.data);
      setIncomingError("");
    } catch {
      setIncomingError("Couldn't load requests.");
    }
  }, []);

  const loadSent = useCallback(async () => {
    try {
      const res = await client.get("/friendships/sent/");
      setSent(res.data);
      setSentError("");
    } catch {
      setSentError("Couldn't load sent requests.");
    }
  }, []);

  useEffect(() => {
    loadFriends();
    loadIncoming();
    loadSent();
  }, [loadFriends, loadIncoming, loadSent]);

  async function acceptRequest(request) {
    setBusyRequestId(request.id);
    try {
      await client.post(`/friendships/${request.id}/accept/`);
      setIncoming((rs) => rs.filter((r) => r.id !== request.id));
      loadFriends();
    } catch {
      setIncomingError("Couldn't accept the request.");
    } finally {
      setBusyRequestId(null);
    }
  }

  async function rejectRequest(request) {
    setBusyRequestId(request.id);
    try {
      await client.post(`/friendships/${request.id}/reject/`);
      setIncoming((rs) => rs.filter((r) => r.id !== request.id));
    } catch {
      setIncomingError("Couldn't reject the request.");
    } finally {
      setBusyRequestId(null);
    }
  }

  async function cancelRequest(request) {
    setBusyRequestId(request.id);
    try {
      await client.post(`/friendships/${request.id}/cancel/`);
      setSent((rs) => rs.filter((r) => r.id !== request.id));
      setSentError("");
    } catch {
      setSentError("Couldn't cancel the request.");
    } finally {
      setBusyRequestId(null);
    }
  }

  function handleShareChange(friendshipId, newShare) {
    setFriends((fs) =>
      fs.map((f) => (f.friendship_id === friendshipId ? { ...f, my_share: newShare } : f))
    );
    setManageEntry((e) => (e && e.friendship_id === friendshipId ? { ...e, my_share: newShare } : e));
  }

  function handleRemoved(friendshipId) {
    setFriends((fs) => fs.filter((f) => f.friendship_id !== friendshipId));
    setManageEntry(null);
  }

  return (
    <div className="min-h-screen bg-page font-body pb-24">
      <div className="max-w-lg mx-auto px-5">
        <h1 className="font-display font-medium text-3xl text-ink pt-6 pb-3">Friends</h1>

        <div className="flex gap-1.5 border-b border-border">
          {[
            { key: "friends", label: "Friends", count: friends?.length },
            // Incoming only: a sent request is waiting on the other person,
            // so counting it would overstate what needs your attention.
            { key: "requests", label: "Requests", count: incoming?.length },
            { key: "add", label: "Add" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-center text-sm pb-2.5 -mb-px ${
                tab === t.key ? "text-forest border-b-2 border-forest" : "text-ink-soft"
              }`}
            >
              {t.label}
              {t.count != null &&
                (t.key === "requests" && t.count > 0 ? (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-sage text-white text-[11px] ml-1">
                    {t.count}
                  </span>
                ) : (
                  <span className="text-ink-soft"> {t.count}</span>
                ))}
            </button>
          ))}
        </div>

        <div className="py-4">
          {tab === "friends" && (
            <>
              {!friends && !friendsError && <p className="text-ink-soft text-sm">Loading…</p>}

              {friendsError && (
                <div className="bg-card border border-border rounded-xl px-4 py-6 text-center">
                  <p className="text-ink-soft text-sm">{friendsError}</p>
                </div>
              )}

              {friends && friends.length === 0 && (
                <div className="bg-card border border-border rounded-xl px-4 py-8 text-center">
                  <p className="text-ink font-medium mb-1">No friends yet</p>
                  <p className="text-ink-soft text-sm">Add someone by username to get started.</p>
                </div>
              )}

              {friends && friends.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {friends.map((entry) => (
                    <FriendListRow key={entry.friendship_id} entry={entry} onManage={setManageEntry} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "requests" && (
            <RequestsPanel
              incoming={incoming}
              incomingError={incomingError}
              sent={sent}
              sentError={sentError}
              onAccept={acceptRequest}
              onReject={rejectRequest}
              onCancel={cancelRequest}
              busyId={busyRequestId}
            />
          )}

          {tab === "add" && <AddPanel onSent={loadSent} />}
        </div>
      </div>

      <SharingSheet
        entry={manageEntry}
        onClose={() => setManageEntry(null)}
        onShareChange={(newShare) => handleShareChange(manageEntry.friendship_id, newShare)}
        onRemoved={handleRemoved}
      />

      <BottomTabBar />
    </div>
  );
}
