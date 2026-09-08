// How far away someone is, in words. Shared rather than written per screen so
// the same distance can never be phrased two ways -- and so a proximity_only
// share can never pick up a number the server did not send.
export function distanceLabel(friend) {
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
