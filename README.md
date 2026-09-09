# Ka Chau?

**क छौ?** — Nepali for *"Where are you?"*

A friend proximity app that answers one question: **is my friend close to me right now?**

Not a map you watch. Not a location history. Just the answer you'd otherwise phone someone to get.

**Live:** [ka-chau.onrender.com](https://ka-chau.onrender.com) · **API:** [ka-chau-api.onrender.com](https://ka-chau-api.onrender.com)
[![CI](https://github.com/Aakriti582/Ka-Chau/actions/workflows/ci.yml/badge.svg)](https://github.com/Aakriti582/Ka-Chau/actions/workflows/ci.yml)


> Hosted on Render's free tier, which sleeps after 15 minutes of inactivity. The first request after a quiet period takes 30–60 seconds to wake the server. Location sharing needs HTTPS, which the deployed site has; `localhost` is the only exception browsers make.

---

## The problem

Meeting a friend involves a call that exists to transfer about one bit of information. *Are you close?* Yes or no. The call is friction, and the answer rarely needs to be more precise than that.

Ka Chau removes the call. Open it and you see which friends are currently within 2 km of wherever you're standing, how far away they are, and — crucially — how recent that information is.

## What it deliberately isn't

- **Not a tracker.** There is no location history table. Each user has exactly one row holding their latest position, overwritten in place. There is no trail to subpoena, leak, or accidentally expose.
- **Not always-on surveillance.** Sharing is opt-in per friend, revocable instantly, and can be time-boxed to a few hours.
- **Not a map-first app.** The list is the primary screen. The map is secondary, and by default has nothing to plot.

---

## The privacy model

This is the part of the project worth reading. Everything else is ordinary Django and React.

### Sharing is directional

Sharing is a relationship, not a user flag, and it points one way. A `LocationShare` row means *owner lets viewer see them*. If you want to see each other, that's two rows.

Granting someone sight of you grants you nothing in return. This is enforced at the query level: `LocationShareViewSet.get_queryset` filters on `owner=user`, so a viewer cannot pause, edit, or revoke a share someone granted them. You control only what you give away.

### Three precision modes, and they are not degrees of the same thing

This is the most important idea in the codebase and the one that has been broken twice by accident, so it's stated plainly here.

| Mode | What the server sends |
|---|---|
| `exact` | Latitude, longitude, and distance to the metre |
| `approx` | Distance rounded to ~100 m. **No coordinates.** |
| `proximity_only` | A boolean and a bucket — "Very close", "Within 1 km", "Within 2 km". **No number, no coordinates.** |

The distinction is enforced in `NearbyViewSet.list`, where coordinates are simply never serialised for the lower two modes. They are not sent-and-hidden, not obfuscated client-side — they never leave the server.

That means a client cannot leak what it was never given, and any future client (a mobile app, say) inherits the guarantee without reimplementing anything.

**`proximity_only` is the default.** A share created without specifying a precision is the most private one, not the most revealing.

> **If you're modifying this code:** treat anything touching `precision` as worth a second look. It has been flattened twice — once by a `PATCH` endpoint that bypassed the create-time validator, and once by a UI badge labelling `proximity_only` as "approx". Both were silent.

### Freshness is part of the data

A distance shown without a timestamp is misleading — it looks live whether it's five seconds or fifty minutes old.

Every position the API returns carries `updated_at`, and every position the UI shows carries a relative age beside it: *"476 m away · just now"*. Positions older than 15 minutes are excluded from `nearby` entirely and reported separately as stale, with the reason distinguished:

- `stale` — a position exists but predates the cutoff
- `never_shared_location` — the friend is sharing but has never sent a position

### Time-boxed sharing

`expires_at` is nullable, supporting both indefinite sharing and "share until 6pm". The latter is the feature that makes people comfortable turning sharing on at all, because it removes the need to remember to turn it off.

Expiry is evaluated at query time, so a lapsed share stops working without any background job needing to run.

### Unfriending destroys shares

Removing a friendship deletes every `LocationShare` between the two users, in both directions, inside a database transaction.

The reasoning: the people you unfriend are precisely the people who must stop receiving your location. A friendship that ended while a share silently survived would be the worst possible failure in an app like this. The transaction ensures you can't end up with the friendship gone and the share alive.

---

## Screenshots

<!-- TODO: add screenshots
     Suggested: the Nearby list with a friend visible, the sharing sheet showing
     the three precision options, the Me screen's "who can see you" section,
     and the map with a pin and a ring. -->

---

## Architecture

```
  Phone (browser)                        Phone (browser)
  posts its position                     asks who is within 2 km
         |                                       |
         +------------------+--------------------+
                            |
                      HTTPS (Cloudflare)
                            |
              +-------------------------+
              |   Render static site    |   React SPA
              +-------------------------+
                            |
              +-------------------------+
              |   Render web service    |   Django + DRF + Gunicorn
              |   Auth, sharing rules,  |
              |   radius query          |
              +-------------------------+
                            |
              +-------------------------+
              |  PostgreSQL + PostGIS   |   One row per user.
              |                         |   No history.
              +-------------------------+
```

**Stack**

- **Backend** — Django 6.1, Django REST Framework, GeoDjango, SimpleJWT
- **Database** — PostgreSQL 16 + PostGIS 3.6
- **Frontend** — React 19, Vite, React Router, Tailwind v4, Leaflet
- **Maps** — OpenStreetMap tiles (no API key, no billing)
- **Hosting** — Render (static site + web service + managed Postgres)

### Why polling, not WebSockets

The client posts its position every 60–120 seconds while moving and polls `/api/nearby/` every 30 seconds while the screen is open. Django Channels would be the "correct" answer for genuinely live movement, but it roughly doubles the deployment complexity for a gain nobody would notice at this scale.

The current architecture comfortably handles low hundreds of concurrent users. Beyond that, polling becomes the bottleneck and WebSockets start to earn their cost.

### Why `watchPosition` and not an interval

`navigator.geolocation.watchPosition` fires when the device detects movement rather than on a fixed schedule. A phone on a desk sends almost nothing; a phone on a bike sends every minute or two.

A `setInterval` calling `getCurrentPosition` would poll the GPS chip at a constant rate regardless of whether anything changed — which is how location apps earn a reputation for draining batteries and get uninstalled. Client-side throttling caps updates at one per minute regardless.

---

## The core query

Everything about the app reduces to this:

```python
shares = (LocationShare.objects
    .filter(viewer=me, is_paused=False)
    .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())))

precision_by_owner = {s.owner_id: s.precision for s in shares}

locations = (LastKnownLocation.objects
    .filter(user_id__in=precision_by_owner.keys())              # consent
    .filter(point__distance_lte=(my_location.point, D(km=2)))   # radius
    .filter(updated_at__gte=cutoff)                             # freshness
    .annotate(dist=Distance("point", my_location.point))
    .order_by("dist"))
```

Three filters, three separate concerns, in a deliberate order.

**Consent first.** A location the caller has no right to see never enters the query at all.

**Then radius.** Note that this is *not* a geofence. There is no circle stored anywhere. The caller's own live position becomes the centre at request time, so the radius follows them — Birganj today, Kathmandu tomorrow, no configuration.

**Then freshness.** Stale coordinates are worse than none, because they look current.

### `geography`, not `geometry`

```python
point = gis_models.PointField(geography=True, spatial_index=True)
```

`geography=True` computes distances across the curve of the Earth and returns true metres, so there's no hand-rolled haversine anywhere in this codebase. `spatial_index=True` creates the GiST index that keeps the radius query from becoming a full table scan.

The SRID is 4326 — WGS 84, the same coordinate system GPS uses.

> **Coordinate ordering:** GeoDjango's `Point` takes `(longitude, latitude)` — longitude first, the reverse of how people say it aloud. Reversing them produces *no error at all*; the coordinates simply land in the wrong part of the world. The API accepts named `latitude` and `longitude` fields specifically so this trap exists in exactly one place in the codebase.

---

## Decisions worth explaining

Things that look arbitrary until you know why.

**`proximity_only` is the default precision.** The original need was "is she close?", not "what are her coordinates?" A mode that answers the actual question while revealing nothing is both more private and genuinely sufficient. Making it the schema default means the safe option happens without the interface having to remember to choose it.

**An empty list is an object, not an array.** `/api/nearby/` originally returned a bare list. But an empty list meant at least four different things — nobody shares with you, friends share but are far away, friends share but their data is stale, sharing is paused. A frontend couldn't tell them apart, so it could only show one generic message. The response now carries `nearby`, `stale`, and a `counts` block, because the server is the only party that knows *why* the list is empty.

**404, not 403, for a friendship you're not part of.** A 403 confirms the resource exists, which is itself an information disclosure. Filtering the queryset rather than checking permissions inside each action means a foreign ID is simply invisible — and it protects every action at once, including ones added later.

**Username lookup is exact-match only.** No partial search, no autocomplete, no browsing. You can only find someone whose username you already know. Open user search on a location-sharing app is an enumeration risk, and the interface says so plainly rather than hiding the limitation.

**Cancelling a friend request deletes the row rather than marking it rejected.** A lingering rejected row would block a future request through the uniqueness constraint, and "no thanks" is not "never contact me". Blocking deserves to be a separate concept, not a side effect of declining.

**Approximate friends are drawn as a ring, not a point.** The API sends a distance but no bearing. A dot would claim a position the data doesn't support; a band at the correct radius says *they are somewhere on this line*, which is exactly what's known. `proximity_only` friends aren't drawn at all — they're counted below the map, because there is nothing to place.

**Usernames can't be changed.** Friend lookup keys on username. If it were mutable, every pending request pointing at a user would break, and anyone who'd noted their username could no longer reach them.

---

## Running locally

### With Docker (recommended)

```bash
git clone <your-repo-url>
cd ka-chau
cp .env.example .env    # then fill it in
docker compose up
```

That's it. The database, PostGIS, migrations and static files are all handled. Backend at `http://localhost:8000`.

`.env`:

```
SECRET_KEY=<anything, for local dev>
DEBUG=True
DB_PASSWORD=<pick one>
DATABASE_URL=postgis://kachau:<same password>@localhost:5433/kachau
ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

`DATABASE_URL` here is for running Django directly on the host. Inside Docker, compose overrides it to reach the database at `db:5432` on the internal network — containers address each other by service name, so the published host port is irrelevant between them.

Note the host port is **5433**, not 5432, to avoid colliding with any PostgreSQL already installed on the machine.

To create an admin user:

```bash
docker compose exec web python manage.py createsuperuser
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to Django on port 8000, so the browser sees a single origin and CORS never arises in development.

### Without Docker

You'll need WSL2 or Linux. GeoDjango requires the GEOS, PROJ and GDAL C libraries, and installing those on native Windows is a genuinely bad time.

```bash
sudo apt install -y binutils libproj-dev gdal-bin libgdal-dev python3-dev

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

docker compose up -d db        # database only
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Django needs those libraries on the host even when the database itself runs in a container.

To confirm PostGIS is available:

```bash
docker compose exec db psql -U kachau -d kachau -c "SELECT PostGIS_Version();"
```

## Deployment

Two Render services plus a managed Postgres, all in Singapore.

**Web service (Django)**

| Setting | Value |
|---|---|
| Build | `./build.sh` |
| Start | `gunicorn config.wsgi:application` |
| `DATABASE_URL` | Internal connection string from the database service |
| `SECRET_KEY` | Generated by Render |
| `DEBUG` | `False` |
| `ALLOWED_HOSTS` | the backend hostname |
| `CORS_ALLOWED_ORIGINS` | the frontend URL, no trailing slash |

PostGIS must be enabled once on the database after creation:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**Static site (React)**

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build | `npm install && npm run build` |
| Publish | `dist` |
| `VITE_API_URL` | the backend URL, ending in `/api` |

Plus a rewrite rule — **Source** `/*`, **Destination** `/index.html`, **Action** Rewrite. Without it, refreshing on any route other than `/` returns 404, because React Router resolves routes in the browser and the server has no file at that path.

> `VITE_*` variables are substituted at **build time**. Changing one requires a rebuild — setting it and reloading does nothing.

---

## Authentication

Access tokens live in memory. The refresh token lives in an httpOnly cookie scoped to `/api/auth/`, which JavaScript cannot read at all — so an XSS vulnerability can't steal a 30-day credential.

Because the access token doesn't survive a page reload, the app performs a silent refresh on boot before rendering any route.

Signing out **must** call `POST /api/auth/logout/`. The client cannot delete an httpOnly cookie; only the server can. A client-only sign-out would leave a live credential in the browser, and the next page load would silently sign the user back in — on a shared computer, as the previous person.

Boot has a hard timeout. If the refresh call neither resolves nor rejects — a hung request on a poor connection, or an in-app browser that silently drops it — the app falls through to the login screen after 25 seconds rather than holding its boot screen open indefinitely. An empty screen that never changes is indistinguishable from a crash, and on a free tier where the backend sleeps after 15 minutes of inactivity, slow first loads are normal rather than exceptional.
---

## Known limitations

**Third-party cookie dependency.** The frontend and backend sit on two different `onrender.com` subdomains. Because `onrender.com` is on the public suffix list, every subdomain is a separate *site*, so the refresh cookie is third-party. It works today via `SameSite=None; Secure`, but that depends on browser policy rather than anything in this codebase — Safari and Firefox are stricter than Chrome, and Chrome has been tightening. Splitting into `example.com` and `api.example.com` would make them same-site and remove the dependency entirely.

**No CSRF protection on the refresh endpoint.** The API endpoints authenticate via the `Authorization` header, which browsers don't attach automatically, so they aren't CSRF-vulnerable. The refresh endpoint is different: it reads a cookie, which browsers *do* send automatically. A malicious site could trigger a token rotation. CORS prevents them reading the response, so the impact is limited, but it isn't nothing.

**No location retention policy.** Positions are overwritten rather than accumulated, so there's no history — but a user who stops using the app leaves their last position in the database indefinitely. A periodic job clearing positions older than 24 hours would let the app make that promise honestly. It currently doesn't make the promise.

**The "until this evening" preset hardcodes UTC+5:45.** For a user outside Nepal, "evening" would be computed against the wrong timezone. Reading `Intl.DateTimeFormat().resolvedOptions().timeZone` would fix it.

**Free tier cold starts.** Render sleeps the service after 15 minutes idle. First request after that takes 30–60 seconds.

**Throttling is in-memory.** Registration is rate-limited via Django's default cache, which resets when the service restarts. On a free tier that restarts regularly, the limit is softer than it looks. Redis would make it real.

**OSM tile usage.** OpenStreetMap's tile servers are free but ask that heavy consumers run their own. At any real scale this should move to a tile provider such as MapTiler or Stadia.

**No push notifications.** Proximity state is modelled in the database (`ProximityState`, with hysteresis in mind to prevent a friend sitting at 1.99 km triggering an alert every ninety seconds), but nothing is wired up. This is a web app, and a browser can't notify you when it isn't open — that needs the mobile client.

---

## What would come next

**A mobile client.** The single biggest limitation of a web app here is that browser geolocation only works while the tab is open and focused. Lock your phone and your friends stop seeing you. React Native with Expo would give background location and push notifications, and the backend wouldn't change at all — it was designed with that migration in mind.

**Push on enter/exit**, using the existing `ProximityState` model with a hysteresis band (nearby below 2000 m, not-nearby only above 2400 m) so a friend hovering at the boundary doesn't generate a notification every poll.

**Group sharing** — sharing with a circle of friends rather than pairwise.

---

## Project structure

```
ka-chau/
├── accounts/          # custom user model, auth views, profile
├── proximity/         # friendships, sharing, locations, the nearby query
├── config/            # settings, root urls
├── frontend/
│   └── src/
│       ├── api/       # axios client, token handling, refresh interceptor
│       ├── pages/     # Nearby, Friends, Map, Me, Login, Register
│       ├── components/
│       ├── hooks/     # useLocationReporter
│       └── utils/
├── docs/design/       # design system reference
├── docker-compose.yaml
└── build.sh           # Render build script
```

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register/` | Create an account; returns an access token and sets the refresh cookie |
| `POST` | `/api/auth/login/` | Sign in |
| `POST` | `/api/auth/refresh/` | New access token from the refresh cookie |
| `POST` | `/api/auth/logout/` | Clear the refresh cookie |
| `GET` | `/api/me/` | Own profile |
| `PATCH` | `/api/me/` | Update display name |
| `GET` | `/api/friendships/friends/` | Accepted friends with the caller's share to each |
| `GET` | `/api/friendships/pending/` | Incoming requests |
| `GET` | `/api/friendships/sent/` | Outgoing requests |
| `GET` | `/api/friendships/find/?username=` | Exact-match user lookup |
| `POST` | `/api/friendships/` | Send a request |
| `POST` | `/api/friendships/{id}/accept/` | Accept (recipient only) |
| `POST` | `/api/friendships/{id}/reject/` | Reject (recipient only) |
| `POST` | `/api/friendships/{id}/cancel/` | Withdraw (sender only) |
| `POST` | `/api/friendships/{id}/remove/` | Unfriend; cascades to shares |
| `GET` | `/api/shares/` | Shares the caller has granted |
| `POST` | `/api/shares/` | Start sharing with a friend |
| `GET` | `/api/shares/shared_with_me/` | Shares granted to the caller |
| `PATCH` | `/api/shares/{id}/` | Change precision or expiry |
| `POST` | `/api/shares/{id}/pause/` `/resume/` | Pause or resume |
| `DELETE` | `/api/shares/{id}/` | Revoke |
| `POST` | `/api/locations/` | Report a position |
| `GET` | `/api/nearby/` | Who is within 2 km, with counts and stale entries |

---

## Built by

Aakriti Limbu — BSc IT, LBEF Campus / Asia Pacific University.

Built in eleven days as a personal project. The build was documented daily; those logs are in `docs/` if you're curious how it went, including the parts that went badly.
