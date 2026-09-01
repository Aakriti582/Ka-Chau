import { timeAgo } from "../utils/time";

function distanceLabel(friend) {
  if (friend.distance_m != null) {
    return friend.distance_m < 1000
      ? `${friend.distance_m} m away`
      : `${(friend.distance_m / 1000).toFixed(1)} km away`;
  }
  if (friend.distance_bucket) {
    return {
      under_500m: "Very close",
      under_1km: "Within 1 km",
      under_2km: "Within 2 km",
    }[friend.distance_bucket];
  }
  return "Nearby";
}

export default function FriendRow({ friend, stale = false }) {
  const name = friend.user.display_name || friend.user.username;
  const initial = name[0].toUpperCase();

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center
                    font-medium text-white shrink-0
                    ${stale ? "bg-slate-300" : "bg-slate-800"}`}
      >
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 truncate">{name}</p>
        <p className="text-sm text-slate-500">
          {stale
            ? friend.reason === "never_shared_location"
              ? "Hasn't shared a location yet"
              : `Last seen ${timeAgo(friend.updated_at)}`
            : `${distanceLabel(friend)} · ${timeAgo(friend.updated_at)}`}
        </p>
      </div>

      {!stale && friend.precision === "proximity_only" && (
        <span className="text-xs text-slate-400 border border-slate-200
                         rounded-full px-2 py-0.5 shrink-0">
          approx
        </span>
      )}
    </div>
  );
}