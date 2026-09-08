import { timeAgo } from "../utils/time";
import { distanceLabel } from "../utils/distance";

const PRECISION_BADGE = {
  approx: { label: "Approx", className: "border-teal text-[#5E7C7C]" },
  proximity_only: { label: "Proximity", className: "border-[#B9C3BA] border-dashed text-ink-soft" },
};

export default function FriendRow({ friend, stale = false }) {
  const name = friend.user.display_name || friend.user.username;
  const initial = name[0].toUpperCase();
  const badge = !stale && PRECISION_BADGE[friend.precision];

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center
                    font-display text-base shrink-0
                    ${stale ? "bg-border text-ink-faint" : "bg-forest text-white"}`}
      >
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate ${stale ? "text-ink-faint" : "text-ink"}`}>{name}</p>
        <p className={`text-[13px] mt-0.5 ${stale ? "text-ink-faint" : "text-ink-soft"}`}>
          {stale
            ? friend.reason === "never_shared_location"
              ? "Hasn't shared a location yet"
              : `Last seen ${timeAgo(friend.updated_at)}`
            : `${distanceLabel(friend)} · ${timeAgo(friend.updated_at)}`}
        </p>
      </div>

      {badge && (
        <span
          className={`text-[10px] tracking-[.08em] uppercase px-2.5 py-1 rounded-full border shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
