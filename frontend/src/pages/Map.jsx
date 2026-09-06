import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Circle, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import client from "../api/client";
import useLocationReporter from "../hooks/useLocationReporter";
import BottomTabBar from "../components/BottomTabBar";
import SharingSheet from "../components/SharingSheet";
import { timeAgo } from "../utils/time";

const POLL_MS = 30_000;

// NEARBY_RADIUS_KM on the server. The API filters to this radius, so the circle
// is not a display choice -- it is the exact edge of what the data can contain.
const RADIUS_M = 2000;

const STALE_AFTER_MS = 60 * 60 * 1000;

// A stroke-only ring is a ~2px tap target. An invisible wider stroke sits under
// each visible ring so approximate friends can actually be opened on a phone.
const RING_HIT_WEIGHT = 24;

const FOREST = "#2A3D2E";
const SAGE = "#7CA982";
const TEAL = "#A3C4C4";
const INK_SOFT = "#6B7A6E";

// Leaflet owns these nodes, so its own classes are the only handle on them.
const MAP_CSS = `
.kc-map .leaflet-container { background:#E9ECE9; font-family:'Lora',Georgia,serif; }
.kc-map .leaflet-tile { filter:saturate(.5) brightness(1.05) contrast(.95); }
.kc-map .leaflet-control-attribution {
  font-size:9px; line-height:1.5; padding:1px 5px;
  background:rgba(255,255,255,.82); color:#6B7A6E;
}
.kc-map .leaflet-control-attribution a { color:#2A3D2E; }
`;

// Pin labels are built as HTML strings for L.divIcon, and display_name is set
// by the friend, so it goes through here before it is ever interpolated.
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function nameOf(entry) {
  return entry.user.display_name || entry.user.username;
}

function metres(m) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

const BUCKET_LABEL = {
  under_500m: "Very close",
  under_1km: "Within 1 km",
  under_2km: "Within 2 km",
};

const PRECISION_BADGE = {
  exact: { label: "Exact", className: "border-forest text-forest" },
  approx: { label: "Approx", className: "border-teal text-[#5E7C7C]" },
  proximity_only: {
    label: "Proximity",
    className: "border-[#B9C3BA] border-dashed text-ink-soft",
  },
};

function isStale(entry) {
  return Date.now() - new Date(entry.updated_at).getTime() > STALE_AFTER_MS;
}

// A teardrop plus a two-line chip. Fresh pins read name-first; stale ones lead
// with the age, because for a stale pin the age is the part that matters.
function pinIcon(entry) {
  const stale = isStale(entry);
  const name = esc(nameOf(entry));
  const detail = esc(`${metres(entry.distance_m)} · ${timeAgo(entry.updated_at)}`);

  const drop = stale
    ? `background:transparent;border:1.5px dashed ${INK_SOFT};`
    : `background:${FOREST};border:2px solid #fff;box-shadow:0 2px 6px rgba(30,42,32,.4);`;

  const chip = stale
    ? `background:rgba(255,255,255,.82);border:1px dashed #C9CFC9;`
    : `background:rgba(255,255,255,.94);border:1px solid #E3E5E8;`;

  const lead = stale ? esc(timeAgo(entry.updated_at)) : name;
  const trail = stale ? name : detail;

  return L.divIcon({
    className: "",
    // No iconSize: Leaflet would stamp those pixels on the wrapper, and a label
    // of unknown width needs the box to shrink-wrap its content instead. A
    // fixed size here leaves the tap target the wrong shape.
    iconAnchor: [12, 26],
    html: `
      <div style="display:flex;align-items:center;gap:6px;width:max-content">
        <div style="width:22px;height:22px;flex:none;border-radius:50% 50% 50% 3px;
                    transform:rotate(45deg);${drop}"></div>
        <div style="font:400 11px/1.35 Lora,Georgia,serif;white-space:nowrap;
                    border-radius:8px;padding:3px 7px;${chip}">
          <div style="color:${stale ? INK_SOFT : "#1E2A20"}">${lead}</div>
          <div style="color:${INK_SOFT};font-size:10px">${trail}</div>
        </div>
      </div>`,
  });
}

const meIcon = L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: `<div style="width:18px;height:18px;border-radius:50%;background:${SAGE};
                     border:3px solid #fff;box-shadow:0 1px 5px rgba(30,42,32,.45)"></div>`,
});

// Leaflet measures its container once, at init. Inside a flex column the panel
// is often still zero-height at that moment, and navigating back re-mounts into
// a container that has not been laid out yet -- both leave the map rendering
// into a stale viewport until it is told to measure again.
function ViewportSync({ onReady }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    onReady(map);
    return () => observer.disconnect();
  }, [map, onReady]);

  return null;
}

export default function MapScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [manageUserId, setManageUserId] = useState(null);
  const [map, setMap] = useState(null);

  const { status, error: locError, coords } = useLocationReporter();
  const myCoords = coords ? [coords.latitude, coords.longitude] : null;

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

  // Only needed to open a sharing sheet, so a failure here leaves the map and
  // the pin cards working and just hides the button.
  const loadFriends = useCallback(async () => {
    try {
      const res = await client.get("/friendships/friends/");
      setFriends(res.data);
    } catch {
      setFriends(null);
    }
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const recentre = useCallback((target) => {
    if (!map || !target) return;
    map.fitBounds(L.latLng(target).toBounds(RADIUS_M * 2), {
      padding: [10, 10],
      animate: false,
    });
  }, [map]);

  // First fix only. After that the view is the user's to pan; a poll every 30s
  // that yanked the viewport back would make the map unusable.
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    if (!map || !myCoords || framed) return;
    recentre(myCoords);
    setFramed(true);
  }, [map, myCoords, framed, recentre]);

  const nearby = data?.nearby ?? [];
  const counts = data?.counts;

  const exact = useMemo(
    () => nearby.filter((f) => f.precision === "exact" && f.latitude != null),
    [nearby]
  );
  const approx = useMemo(() => nearby.filter((f) => f.precision === "approx"), [nearby]);
  const proximity = useMemo(
    () => nearby.filter((f) => f.precision === "proximity_only"),
    [nearby]
  );

  const buckets = useMemo(() => {
    const tally = {};
    for (const f of proximity) {
      tally[f.distance_bucket] = (tally[f.distance_bucket] || 0) + 1;
    }
    return tally;
  }, [proximity]);

  const selected = nearby.find((f) => f.user.id === selectedId) || null;
  const selectedFriend = selected
    ? friends?.find((f) => f.user.id === selected.user.id)
    : null;

  // Read back out of `friends` rather than snapshotted, so the sheet reflects
  // the reloaded share instead of the one that was there when it opened.
  const manageEntry =
    (manageUserId != null && friends?.find((f) => f.user.id === manageUserId)) || null;

  const plotted = exact.length + approx.length;

  // No own position means no origin: the circle and every ring are measured
  // from it, so the geometry goes away with it rather than being faked.
  const canPlot = Boolean(myCoords);

  let emptyState = null;
  if (data && counts) {
    if (counts.sharing_with_me === 0) {
      emptyState = {
        title: counts.paused > 0 ? "Sharing is paused" : "Nobody is sharing with you",
        body:
          counts.paused > 0
            ? `${counts.paused} friend${counts.paused > 1 ? "s have" : " has"} paused sharing, so there is nothing to place.`
            : "Your circle is empty until a friend shares their location with you.",
        to: "/friends",
        cta: "Add a friend",
      };
    } else if (nearby.length === 0) {
      emptyState = {
        title: "No one within 2 km",
        body: `${counts.sharing_with_me} friend${counts.sharing_with_me > 1 ? "s are" : " is"} sharing, but nobody is inside your circle right now.`,
        to: "/",
        cta: "Open the list instead",
      };
    } else if (plotted === 0) {
      emptyState = {
        title: "Nothing to place",
        body: `${proximity.length} friend${proximity.length > 1 ? "s are" : " is"} nearby on proximity only. They never sent coordinates, so they can't go on the map.`,
        to: "/",
        cta: "Open the list instead",
      };
    }
  }

  return (
    <div className="min-h-screen bg-page font-body pb-24 flex flex-col">
      <style>{MAP_CSS}</style>

      <div className="max-w-lg mx-auto px-5 w-full">
        <h1 className="font-display font-medium text-3xl text-ink pt-6">Map</h1>
        <p className="text-[12.5px] text-ink-soft mt-1 mb-3">
          Pins are friends sharing <em>exact</em>. Approximate shares draw a ring at their
          distance — the distance is known, the direction isn't.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-5 w-full flex-1 flex flex-col">
        {canPlot ? (
          <>
          <div className="kc-map relative shrink-0 h-[clamp(300px,48vh,520px)] rounded-[22px]
                          overflow-hidden border border-border">
            <MapContainer
              center={myCoords}
              zoom={14}
              zoomControl={false}
              /* OSM requires the credit; it stays on and is styled down instead. */
              attributionControl
              className="w-full h-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
              />
              <ViewportSync onReady={setMap} />

              <Circle
                center={myCoords}
                radius={RADIUS_M}
                interactive={false}
                pathOptions={{
                  color: TEAL,
                  weight: 1,
                  dashArray: "5 7",
                  fillColor: TEAL,
                  fillOpacity: 0.06,
                }}
              />

              {/* Every hit area is laid down before any visible ring, so a wide
                  transparent stroke can never sit on top of a neighbouring ring
                  and swallow the taps meant for it. */}
              {approx.map((f) => (
                <Circle
                  key={`${f.user.id}-hit`}
                  center={myCoords}
                  radius={f.distance_m}
                  pathOptions={{
                    color: TEAL,
                    weight: RING_HIT_WEIGHT,
                    opacity: 0,
                    fill: false,
                  }}
                  eventHandlers={{ click: () => setSelectedId(f.user.id) }}
                />
              ))}

              {/* Distance without bearing is a ring, not a place. No fill: a disc
                  would read as "somewhere inside", which is a claim the data
                  does not make. Non-interactive so taps fall through to the
                  wider target beneath it. */}
              {approx.map((f) => (
                <Circle
                  key={f.user.id}
                  center={myCoords}
                  radius={f.distance_m}
                  interactive={false}
                  pathOptions={{
                    color: TEAL,
                    weight: 2,
                    dashArray: "4 6",
                    fill: false,
                    opacity: isStale(f) ? 0.5 : 0.9,
                  }}
                />
              ))}

              {exact.map((f) => (
                <Marker
                  key={f.user.id}
                  position={[f.latitude, f.longitude]}
                  icon={pinIcon(f)}
                  eventHandlers={{ click: () => setSelectedId(f.user.id) }}
                />
              ))}

              <Marker position={myCoords} icon={meIcon} zIndexOffset={1000} />
            </MapContainer>

            {selected && (
              <div className="absolute left-3 right-3 bottom-3 z-[1200]">
                <div className="bg-card/95 border border-border rounded-2xl px-4 py-3.5
                                backdrop-blur-[4px] shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink truncate">{nameOf(selected)}</p>
                      <p className="text-[12.5px] text-ink-soft mt-0.5">
                        {selected.distance_m != null
                          ? `${metres(selected.distance_m)} away · ${timeAgo(selected.updated_at)}`
                          : timeAgo(selected.updated_at)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] tracking-[.08em] uppercase px-2.5 py-1
                                  rounded-full border shrink-0
                                  ${PRECISION_BADGE[selected.precision].className}`}
                    >
                      {PRECISION_BADGE[selected.precision].label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    {selectedFriend ? (
                      <button
                        onClick={() => {
                          // No L.popup is bound in this map, but a stray one
                          // would sit in the popup pane and outlive the sheet.
                          map?.closePopup();
                          setManageUserId(selectedFriend.user.id);
                        }}
                        className="text-[12.5px] text-forest border-b border-sage"
                      >
                        Manage sharing
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-ink-faint">Sharing unavailable</span>
                    )}
                    <button
                      onClick={() => setSelectedId(null)}
                      className="text-[12.5px] text-ink-soft"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Below the tiles rather than over them: as an overlay this blocked a
              third of the map and ate the drag and scroll-zoom gestures under it.
              Wraps to a second line on narrow viewports; the text stays 12px. */}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 px-1">
            <li className="flex items-center gap-2 text-[12px] text-ink">
              <span
                className="w-3.5 h-3.5 shrink-0 bg-forest border-2 border-white
                           shadow-sm rotate-45"
                style={{ borderRadius: "50% 50% 50% 3px" }}
              />
              Exact — pinned{exact.length > 0 ? ` · ${exact.length}` : ""}
            </li>
            <li className="flex items-center gap-2 text-[12px] text-ink">
              <span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-dashed border-teal" />
              Approx — ring at distance{approx.length > 0 ? ` · ${approx.length}` : ""}
            </li>
            <li className="flex items-center gap-2 text-[12px] text-ink">
              <span className="w-3.5 h-3.5 shrink-0 rounded-full bg-sage border-2 border-white shadow-sm" />
              You · your 2 km circle
            </li>
          </ul>
          </>
        ) : (
          <div className="rounded-[22px] border border-border bg-card px-5 py-10 text-center">
            <p className="font-display text-xl text-ink mb-1.5">
              {status === "denied" ? "Location is off" : "Finding your location…"}
            </p>
            <p className="text-ink-soft text-sm max-w-xs mx-auto">
              {status === "denied"
                ? "The map is drawn around you — the circle and every distance are measured from your position. Without it there is nothing to draw."
                : "Waiting for a position fix."}
            </p>
            {status === "denied" && (
              <div className="flex flex-col gap-2 mt-5 max-w-[260px] mx-auto">
                <button
                  onClick={() => window.location.reload()}
                  className="border border-forest text-forest rounded-[14px] py-3 text-sm
                             hover:bg-[#f1f6f1] transition"
                >
                  Allow location
                </button>
                <Link
                  to="/"
                  className="border border-border text-ink-soft rounded-[14px] py-3 text-sm
                             hover:border-sage hover:text-forest transition"
                >
                  Use the list instead
                </Link>
              </div>
            )}
          </div>
        )}

        {canPlot && (
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => recentre(myCoords)}
              className="flex-1 border border-forest text-forest rounded-[14px] py-3 text-sm
                         hover:bg-[#f1f6f1] transition"
            >
              Recentre on me
            </button>
            <Link
              to="/"
              className="flex-1 border border-border text-ink-soft rounded-[14px] py-3 text-sm
                         text-center hover:border-sage hover:text-forest transition"
            >
              Back to list
            </Link>
          </div>
        )}

        {locError && status !== "denied" && (
          <div className="bg-amber-bg border border-amber-border text-amber-ink
                          text-sm rounded-2xl px-4 py-3 mt-3">
            {locError}
          </div>
        )}

        {error && (
          <div className="bg-card border border-border rounded-2xl px-4 py-5 text-center mt-3">
            <p className="text-ink-soft text-sm">{error}</p>
          </div>
        )}

        {loading && !data && !error && (
          <p className="text-ink-soft text-sm mt-3">Loading…</p>
        )}

        {emptyState && (
          <div className="bg-card border border-border rounded-2xl px-4 py-6 text-center mt-3">
            <p className="font-display text-xl text-ink mb-1">{emptyState.title}</p>
            <p className="text-ink-soft text-sm">{emptyState.body}</p>
            <Link
              to={emptyState.to}
              className="inline-block mt-3 text-[13px] text-forest border-b border-sage"
            >
              {emptyState.cta}
            </Link>
          </div>
        )}

        {/* Proximity-only friends sent no coordinates at all, so they are counted
            here rather than placed anywhere on the map. */}
        {proximity.length > 0 && (
          <section className="mt-4">
            <h2 className="text-[11px] font-medium text-ink-soft uppercase tracking-[.14em] mb-2 px-1">
              Proximity only · {proximity.length} · not on the map
            </h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(buckets).map(([bucket, count]) => (
                <span
                  key={bucket}
                  className="text-[12px] text-ink-soft border border-dashed border-[#B9C3BA]
                             rounded-full px-3 py-1.5"
                >
                  {BUCKET_LABEL[bucket]} · {count}
                </span>
              ))}
            </div>
          </section>
        )}

        {data?.stale?.length > 0 && (
          <section className="mt-4">
            <h2 className="text-[11px] font-medium text-ink-soft uppercase tracking-[.14em] mb-2 px-1">
              Not updating · {data.stale.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {data.stale.map((f) => (
                <span
                  key={f.user.id}
                  className="text-[12px] text-ink-faint border border-dashed border-border
                             rounded-full px-3 py-1.5"
                >
                  {f.reason === "never_shared_location"
                    ? `${nameOf(f)} · never`
                    : `${timeAgo(f.updated_at)} · ${nameOf(f)}`}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      <SharingSheet
        entry={manageEntry}
        onClose={() => setManageUserId(null)}
        onShareChange={() => {
          loadFriends();
          load();
        }}
        onRemoved={() => {
          setManageUserId(null);
          setSelectedId(null);
          loadFriends();
          load();
        }}
      />

      <BottomTabBar />
    </div>
  );
}
