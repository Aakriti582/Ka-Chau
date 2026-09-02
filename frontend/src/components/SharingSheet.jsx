import { useEffect, useState } from "react";
import client from "../api/client";

const PRECISION_OPTIONS = [
  {
    value: "proximity_only",
    label: "Proximity only",
    isDefault: true,
    description: "No coordinates. They see “Very close”, “Within 1 km”, “Within 2 km”.",
  },
  {
    value: "approx",
    label: "Approximate",
    description: "Distance rounded to about 100 m. No pin on the map.",
  },
  {
    value: "exact",
    label: "Exact",
    description: "Precise distance and a pin on their map. The most you can give.",
  },
];

function plusHourISO() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

// Nepal is UTC+5:45, so 18:00 Nepal time is always 12:15 UTC the same day —
// computed here directly rather than via the runtime's own local timezone,
// which isn't guaranteed to be Asia/Kathmandu. Shared by the ISO calculation
// and the button label so the two can't drift apart on whether 6pm has passed.
function nepalEveningTarget(now) {
  const nepalNow = new Date(now + NEPAL_OFFSET_MS);
  const todayEvening =
    Date.UTC(nepalNow.getUTCFullYear(), nepalNow.getUTCMonth(), nepalNow.getUTCDate(), 18, 0, 0) -
    NEPAL_OFFSET_MS;
  const passed = todayEvening <= now;
  return { target: passed ? todayEvening + 24 * 60 * 60 * 1000 : todayEvening, passed };
}

function untilEveningISO() {
  return new Date(nepalEveningTarget(Date.now()).target).toISOString();
}

function eveningPresetLabel() {
  return nepalEveningTarget(Date.now()).passed ? "Until tomorrow evening" : "Until this evening";
}

function expiryLine(expiresAt) {
  if (!expiresAt) return "No expiry — sharing continues until you turn it off.";
  const d = new Date(expiresAt);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Stops automatically at ${time}.`
    : `Stops automatically ${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}.`;
}

function localInputMin() {
  const d = new Date(Date.now() + 60000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function SharingSheet({ entry, onClose, onShareChange, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    setError("");
    setConfirmingRemove(false);
    setCustomOpen(false);
  }, [entry?.friendship_id]);

  if (!entry) return null;

  const share = entry.my_share;
  const name = entry.user.display_name || entry.user.username;

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleShare() {
    if (share) {
      run(async () => {
        await client.delete(`/shares/${share.id}/`);
        onShareChange(null);
      });
    } else {
      run(async () => {
        const res = await client.post("/shares/", {
          username: entry.user.username,
          precision: "proximity_only",
        });
        onShareChange(res.data);
      });
    }
  }

  function setPrecision(precision) {
    if (!share || share.precision === precision) return;
    run(async () => {
      const res = await client.patch(`/shares/${share.id}/`, { precision });
      onShareChange(res.data);
      onClose();
    });
  }

  function setExpiry(iso) {
    if (!share) return;
    run(async () => {
      const res = await client.patch(`/shares/${share.id}/`, { expires_at: iso });
      onShareChange(res.data);
      onClose();
    });
  }

  function togglePause() {
    if (!share) return;
    const action = share.is_paused ? "resume" : "pause";
    run(async () => {
      const res = await client.post(`/shares/${share.id}/${action}/`);
      onShareChange(res.data);
    });
  }

  function revoke() {
    if (!share) return;
    run(async () => {
      await client.delete(`/shares/${share.id}/`);
      onShareChange(null);
    });
  }

  function removeFriend() {
    run(async () => {
      await client.post(`/friendships/${entry.friendship_id}/remove/`);
      onRemoved(entry.friendship_id);
    });
  }

  return (
    <div className="fixed inset-0 z-50 font-body">
      <div className="absolute inset-0 bg-[#1E2A20]/32" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 bg-card rounded-t-[28px] px-5 pt-2.5 pb-6 max-h-[88%] overflow-auto shadow-[0_-8px_30px_rgba(30,42,32,.14)]">
        <div className="w-11 h-1 rounded-full bg-border mx-auto mb-4" />

        <div className="flex items-center gap-3">
          <div className="w-[46px] h-[46px] rounded-full bg-forest text-white flex items-center justify-center font-display text-lg shrink-0">
            {name[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl text-ink leading-tight">{name}</div>
            <div className="text-[12.5px] text-ink-soft">@{entry.user.username}</div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex items-center justify-between gap-3.5 px-4 py-3.5 border border-border rounded-[18px]">
          <div>
            <div className="text-[15.5px] text-ink">Share my location</div>
            <div className="text-xs text-ink-soft mt-0.5">One tap on, one tap off</div>
          </div>
          <button
            onClick={toggleShare}
            disabled={busy}
            className={`w-[58px] h-8 rounded-full relative shrink-0 border ${
              share ? "bg-forest border-forest" : "bg-border border-[#c9cfca]"
            }`}
          >
            <span
              className={`absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all ${
                share ? "left-[29px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        <div className="mt-5">
          <div className="text-[11px] tracking-[.14em] uppercase text-ink-soft mb-2.5">Precision</div>
          <div className="flex flex-col gap-2.5">
            {PRECISION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPrecision(opt.value)}
                disabled={!share || busy}
                className="text-left bg-card border border-border rounded-2xl px-[15px] py-3.5 flex gap-3 items-start disabled:opacity-50"
              >
                <span className="w-[18px] h-[18px] rounded-full border border-[#9faea1] shrink-0 mt-0.5 flex items-center justify-center">
                  {(share?.precision ?? "proximity_only") === opt.value && (
                    <span className="w-2.5 h-2.5 rounded-full bg-forest" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-[15.5px] text-ink">
                    {opt.label}
                    {opt.isDefault && (
                      <span className="px-1.5 py-0.5 border border-sage rounded-full text-[10px] tracking-[.08em] uppercase text-forest">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="block text-[12.5px] text-ink-soft mt-0.5">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] tracking-[.14em] uppercase text-ink-soft mb-2.5">Stops sharing after</div>
          <div className="grid grid-cols-2 gap-2.5">
            <button disabled={!share || busy} onClick={() => setExpiry(null)} className="text-sm py-3 rounded-2xl bg-card border border-border text-ink disabled:opacity-50">
              Off
            </button>
            <button disabled={!share || busy} onClick={() => setExpiry(plusHourISO())} className="text-sm py-3 rounded-2xl bg-card border border-border text-ink disabled:opacity-50">
              1 hour
            </button>
            <button disabled={!share || busy} onClick={() => setExpiry(untilEveningISO())} className="text-sm py-3 rounded-2xl bg-card border border-border text-ink disabled:opacity-50">
              {eveningPresetLabel()}
            </button>
            <button disabled={!share || busy} onClick={() => setCustomOpen((v) => !v)} className="text-sm py-3 rounded-2xl bg-card border border-border text-ink disabled:opacity-50">
              Custom…
            </button>
          </div>
          {customOpen && share && (
            <input
              type="datetime-local"
              min={localInputMin()}
              disabled={busy}
              onChange={(e) => e.target.value && setExpiry(new Date(e.target.value).toISOString())}
              className="mt-2.5 w-full font-body text-sm text-ink px-3.5 py-3 bg-card border border-border rounded-[14px] outline-none focus:border-sage"
            />
          )}
          <div className="mt-2.5 text-[12.5px] text-ink-soft">
            {share ? expiryLine(share.expires_at) : "Turn sharing on to set an expiry."}
          </div>
        </div>

        <div className="mt-5.5 pt-4.5 border-t border-border flex flex-col gap-2.5">
          <button
            onClick={togglePause}
            disabled={!share || busy}
            className="font-body text-[15px] text-forest bg-transparent border border-forest rounded-2xl py-3.5 disabled:opacity-50"
          >
            {share?.is_paused ? "Resume sharing" : "Pause for now"}
          </button>
          <button
            onClick={revoke}
            disabled={!share || busy}
            className="font-body text-[15px] text-danger bg-transparent border border-danger-border rounded-2xl py-3.5 disabled:opacity-50"
          >
            Revoke access
          </button>
          <p className="mt-0.5 text-xs text-ink-faint text-center text-balance">
            Either takes effect immediately. Nothing is kept after you revoke. You stay friends.
          </p>
        </div>

        <div className="mt-6 pt-4.5 border-t border-border">
          <div className="text-[11px] tracking-[.14em] uppercase text-ink-faint mb-2.5">End the friendship</div>

          {!confirmingRemove && (
            <>
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft text-balance">
                Revoking stops your location — you're still friends and can turn it back on. Removing{" "}
                {name} undoes the friendship itself: both sides stop sharing, and they'd have to send a
                new request to reach you again.
              </p>
              <button
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
                className="w-full font-body text-[15px] text-danger bg-transparent border border-danger rounded-2xl py-3.5"
              >
                Remove friend
              </button>
            </>
          )}

          {confirmingRemove && (
            <div className="bg-danger-bg border border-danger-border rounded-2xl p-4">
              <p className="text-[13px] text-ink leading-relaxed text-balance">
                Remove {name}? This can't be undone — you'd both need to send a new request to be friends
                again.
              </p>
              <div className="mt-3.5 flex gap-2.5">
                <button
                  onClick={() => setConfirmingRemove(false)}
                  disabled={busy}
                  className="flex-1 font-body text-sm text-ink-soft bg-card border border-border rounded-xl py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={removeFriend}
                  disabled={busy}
                  className="flex-1 font-body text-sm text-white bg-danger rounded-xl py-2.5 disabled:opacity-50"
                >
                  Remove friend
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
