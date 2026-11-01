# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the **safest route** for a trip, based on the weather they will actually meet along the way, the truck's load weight and travel time.

The driver enters an origin, a destination, a departure date/time and a load weight. The app returns up to three route options, checks the forecast **for the hour the truck is expected to reach each checkpoint**, rates every route with the risk and load rules, and recommends the best one with a one-line reason. Everything is shown on an interactive map, with a 0–48 hour weather heatmap that follows the routes. Extras for the road: turn-by-turn directions, live GPS navigation with voice, and weather warnings for the road ahead.

- **Live app:** _add hosted URL here_
- **Loom walkthrough:** _add Loom link here_

---

## Contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [Extras beyond the brief](#extras-beyond-the-brief)
4. [Dev-only storm scenario](#dev-only-storm-scenario)
5. [Tech stack](#tech-stack)
6. [Project structure](#project-structure)
7. [API](#api)
8. [Running locally](#running-locally)
9. [Tests and verification](#tests-and-verification)
10. [Deployment](#deployment)
11. [Security](#security)
12. [Assumptions and limitations](#assumptions-and-limitations)

---

## What it does

- **Trip input:** origin and destination (address search), departure date/time and load weight, plus a checkpoint spacing of 10, 25 or 50 miles.
- **Three route options** with distance, drive time, arrival time and a per-checkpoint risk strip.
- **Time-aware weather:** each checkpoint uses the forecast for the hour the truck gets there, not the weather at departure.
- **Risk classification** for wind, rain and snow, adjusted by the load rules, with the exact reason shown ("Wind 41 mph with 45,000 lb load").
- **Recommendation** using the ranking order from the brief, with a one-line reason. When the recommended route is not the fastest, the reason also says how much slower it is and what weather the faster route would have met.
- **Map:** all routes colour-coded, checkpoint markers coloured by risk with popups (ETA, wind, gusts, rain, snow), and a dark or light base map.
- **Corridor heatmap** with a 0–48 hour slider and play button. It covers a band around the routes (full strength to 25 miles from a route, fading to nothing at 40 miles) and all 49 hours arrive in one response, so scrubbing never waits on the network.
- **Local time:** every time is shown in the trip's own time zone (for example "CST"), and the departure box is entered in the origin's zone.
- **Landing page** that explains the idea, with live wind at six freight hubs.

---

## How it works

### 1. Routing and geocoding
Origin and destination come from the address search (Photon, OpenStreetMap data). The backend asks OSRM for the fastest route plus alternatives. If OSRM returns fewer than three genuinely different routes, it requests routes through a "via" point pushed to either side of the straight line between origin and destination, trying up to eight offsets (±12%, ±18%, ±32% and ±50% of the trip length). Near-duplicates (more than 85% overlap) and silly detours (more than 60% longer than the fastest route) are discarded.

If fewer than three routes are truly possible (for example a trip along a single causeway) the app returns what exists and says why: _"We found only 2 distinct routes between these places. Other candidate roads either overlapped an existing route almost completely or added more than 60% to the distance, so they were not offered."_

### 2. Checkpoints and ETAs
Each route is walked from start to end and a checkpoint is placed every _N_ miles (N = 10, 25 or 50), plus one at the destination. OSRM's per-segment durations give the elapsed time at every point on the line:

```
ETA at checkpoint = departure time + drive time from the origin to that point
```

The forecast hour nearest the ETA is used. A checkpoint whose ETA falls outside the forecast is marked "No forecast" and reported separately rather than guessed.

### 3. Weather risk rules
Each condition is rated separately and the **worst** one becomes the checkpoint's risk.

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | < 25 mph | 25–34 | 35–44 | 45–54 | ≥ 55 mph |
| Rain | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

- **Wind** is the sustained 10 m wind speed in mph. Gusts are shown in the checkpoint popup for context.
- **Rain** is the hourly rain plus showers, converted from mm to inches.
- **Snow** is the hourly snowfall, converted from cm to inches.
- Where two ranges share a boundary value (for example rain at 0.25 in/hr) the higher, more cautious level is used.

### 4. Load rules
Load weight can only make a rating worse:

| Wind | Load | Result |
|---|---|---|
| ≥ 55 mph | any | No Travel |
| 45–54 mph | > 30,000 lb | No Travel |
| 35–44 mph | > 40,000 lb | Severe |

### 5. Route recommendation
Each checkpoint's risk applies to the stretch of road it represents (from the midpoint with the previous checkpoint to the midpoint with the next), which gives the miles at each risk level per route. Routes are ranked by:

1. Fewest **Severe** miles
2. Fewest **High** miles
3. Lowest **average risk** (distance-weighted, Low = 0 … No Travel = 4)
4. Shortest **travel time**

Any route containing **No Travel** miles is ranked below every route without them. If every route has No Travel miles, the safest one is still shown with a warning to change the departure time.

### 6. Heatmap
The heatmap request carries the three route lines. The backend rates a grid of up to ~320 cells for each hour from now to +48 h, but **only fetches weather for cells inside the corridor band**; cells outside it carry no data. Each cell has a continuous score (risk level plus how far into that band the worst condition is) and a 0–1 `mask` that fades the overlay out toward the edge of the band. The frontend renders all 49 frames once, so the slider only swaps images.

---

## Extras beyond the brief

These are additions on top of the required features. They are isolated: if any of them fails, the planner, map and heatmap keep working (see [Fail-safe design](#fail-safe-design)).

- **Turn-by-turn directions** for the selected route (OSRM steps), in the Directions tab. Tap a step to see where it happens on the map.
- **Use my location** fills the starting point from the browser's GPS and a reverse lookup of the address.
- **Live navigation** ("Start navigation"): follows the driver's GPS, shows the next turn and distance, the road they are on, miles and time left, arrival time and speed, announces each turn by voice about half a mile ahead (mute button), warns about High/Severe/No Travel conditions coming up on the route, detects when the driver leaves the route and offers "Re-plan from here", and shows "You have arrived".
- **Panel layout controls:** the planner panel can dock left or below the map, be made wider/taller, or hidden. The choice is remembered. On narrow screens it always docks below the map.
- **Quick-pick departure times, load slider with a hint about which load rule applies**, dark/light map, Reset button.
- **Landing page** with a live wind strip from `/api/conditions/`.

### Fail-safe design
- Directions, the navigation banner and the location marker each sit inside an error boundary; a failure shows a short note in that spot only.
- The plan response is normalised on arrival, so a missing or malformed `steps` list cannot break the core plan.
- Geolocation, reverse lookup and speech are all optional and wrapped; a blocked or failing one produces a message, never an exception in the planner.
- A failed heatmap request leaves the routes and map working and shows a message.

---

## Dev-only storm scenario

A **local-development-only** simulation exists to prove the risk logic end to end. It lays a moving storm over the fastest route: wind peaks at the storm's centre, falls off smoothly with distance, and the centre drifts along the route over 48 hours. Rain is added at the peak. Routes that stay away from the storm are untouched, so the planner has a real reason to prefer a slower, calmer road.

```bash
# backend/.env (or the environment) — local development only
DJANGO_DEBUG=1
WEATHER_SCENARIO=storm
WEATHER_STORM_PEAK_MPH=42     # optional; default 42
```

- **Cannot run in production.** `settings.py` forces `WEATHER_SCENARIO` to empty whenever `DJANGO_DEBUG` is off, and the scenario code checks `DEBUG` again before doing anything. A test reloads the settings with `DJANGO_DEBUG=0` and `WEATHER_SCENARIO=storm` and asserts the scenario is off.
- **The UI says so.** While it is active the plan and heatmap responses carry a `simulation` object and the app shows an amber **"Simulated weather (dev only)"** banner.
- The real forecasts are never modified; the storm is applied to a copy.
- The heatmap for a trip uses the same storm as that trip's plan, so the slider and the checkpoints agree.

Suggested peaks: **34** to see a High↔Severe load-rule flip (about 40 mph on the route), **42** to see the recommendation switch, **60** to see No Travel.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Material UI; Inter and DM Serif Display fonts, self-hosted |
| Map | Leaflet (react-leaflet), OpenStreetMap tiles |
| Backend | Python, Django 5, Django REST Framework |
| Routing | [OSRM](https://project-osrm.org/) (routes and turn-by-turn steps) |
| Geocoding | [Photon](https://photon.komoot.io/) (OpenStreetMap), search and reverse |
| Weather | [Open-Meteo](https://open-meteo.com/) hourly forecast and time zones |

All three external services are free and need **no API keys**. Every external call goes through the Django backend, and responses are cached (forecasts 30 minutes, routes 1 hour, place searches 24 hours, time zones 30 days, landing conditions 10 minutes) to keep the app fast and within free-tier limits.

---

## Project structure

```
.
├── backend/
│   ├── Dockerfile              # Cloud Run container image
│   ├── config/                 # Django settings and URLs
│   └── trips/
│       ├── services/
│       │   ├── geo.py          # distances, polylines, interpolation
│       │   ├── routing.py      # OSRM routes, steps, via-point alternatives
│       │   ├── weather.py      # Open-Meteo batched forecasts, time zones, cache
│       │   ├── geocoding.py    # Photon place search and reverse lookup
│       │   ├── risk.py         # risk rules and load rules (unchanged by the extras)
│       │   ├── planner.py      # checkpoints, ETAs, summaries, ranking, reasons
│       │   ├── heatmap.py      # 0-48 h corridor grid with the fading band
│       │   ├── conditions.py   # live wind at freight hubs (landing page)
│       │   ├── scenario.py     # DEV-ONLY storm simulation
│       │   └── http.py         # timeouts, retries, safe upstream errors
│       ├── serializers.py      # strict input validation
│       ├── views.py
│       └── tests/              # unit and API tests (external services mocked)
├── frontend/
│   ├── src/
│   │   ├── components/         # Landing, TripForm, MapView, RouteCard, DirectionsList, NavBanner, ...
│   │   └── lib/                # API client, types, geometry, directions, layout, GPS hook
│   └── public/                 # hero image (WebP)
├── deploy/                     # Cloud Run and Vercel deployment scripts (PowerShell)
└── README.md
```

---

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check |
| `GET` | `/api/geocode/?q=<text>` | Place search for the origin and destination fields (duplicate labels removed) |
| `GET` | `/api/reverse/?lat=&lon=` | Nearest named place to a GPS fix; falls back to `"My location"` |
| `GET` | `/api/timezone/?lat=&lon=` | IANA time zone at a point (used for local times) |
| `GET` | `/api/conditions/` | Current wind and risk level at six freight hubs (landing page) |
| `POST` | `/api/plan/` | Routes, checkpoints, risk, ETAs, steps, summaries and the recommendation |
| `POST` | `/api/heatmap/` | Gridded risk for the corridor, hours 0–48 |

Example `POST /api/plan/` body:

```json
{
  "origin": { "lat": 41.8781, "lon": -87.6298, "label": "Chicago, IL" },
  "destination": { "lat": 39.7684, "lon": -86.1581, "label": "Indianapolis, IN" },
  "departure_time": "2026-11-02T14:00:00Z",
  "load_weight_lb": 42000,
  "checkpoint_interval_miles": 25
}
```

The response contains `routes[]` (each with `checkpoints`, `summary`, `geometry` and `steps`), `recommended_id`, `recommendation { reason, warning }`, `bounds`, `inputs` (including `timezone`), `route_notice` (why fewer than three routes were offered, or `null`) and, only in the dev storm scenario, `simulation`.

Example `POST /api/heatmap/` body (`corridor` is optional; without it the whole rectangle is used):

```json
{
  "south": 29.7, "west": -97.0, "north": 32.8, "east": -95.3,
  "load_weight_lb": 32000,
  "corridor": [[[32.78, -96.80], [32.5, -96.6]], [[32.78, -96.80], [32.2, -97.0]]]
}
```

The response has `levels`, `scores` (49 hours × cells), `mask` (0–1 per cell), `rows`, `cols`, `bounds` (padded to include the band) and `start`.

---

## Running locally

Requirements: **Python 3.11+** and **Node.js 20+**.

### Backend
```bash
cd backend
python -m venv venv
# Windows:      venv\Scripts\activate
# macOS/Linux:  source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env      # macOS/Linux: cp .env.example .env
python manage.py runserver
```
The API runs at `http://localhost:8000`. No database or migrations are needed.

### Frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. In development, Vite proxies `/api` to the Django server on port 8000. To point the dev server at a different backend, set `API_PROXY_TARGET`, for example `API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev`.

The planner is at `/#/plan` and the landing page at `/`.

---

## Tests and verification

```bash
cd backend && python manage.py test        # backend unit and API tests
cd frontend && npm run build               # type-check and production build
cd frontend && npx oxlint                  # lint
```

The backend tests run offline (external services are mocked). They cover:

- every risk and load-rule boundary, checkpoint placement and ETAs, ranking order and the recommendation text;
- **the risk logic with mocked weather:** a storm on the fastest route switches the recommendation to a slower, calmer one with the right reason; about 40 mph wind is High at 15,000 lb and Severe at 45,000 lb (and exactly 40,000 lb stays High); wind ≥ 55 mph, or 45–54 mph above 30,000 lb, is No Travel, ranks last, and the all-routes warning appears only when every route is blocked;
- the dev storm scenario (peak at the centre, fades with distance, moves smoothly over 48 h, cannot be enabled outside debug, never modifies real forecasts);
- the corridor heatmap (band weights, only the band is fetched, cells outside it carry no data);
- the via-point route fallback and the shortfall note;
- API validation, error handling, reverse geocoding and the conditions endpoint.

### Live route-count check
Planning against the real OSRM service (32,000 lb, departing in 2 hours):

| Trip | Routes returned |
|---|---|
| Dallas → Houston | 3 |
| Chicago → Indianapolis | 3 |
| Denver → Salt Lake City | 3 |
| Los Angeles → Las Vegas | 3 |
| Atlanta → Charlotte | 3 |
| Dallas → Fort Worth (short) | 3 |
| Fargo → Bismarck (sparse roads) | 3 |
| Key West → Miami (one road) | 2, with the explanatory note |

### Live storm check (dev scenario, Dallas → Houston)
- **Recommendation switch:** with the fastest route (A, 4.2 h) in the storm, the recommended route is B (5.5 h), and the reason reads "…It is 1 h 18 min slower than the fastest route (Route A), which has 25 mi of High-risk weather."
- **Load rule (peak ≈ 40 mph on Route A):** 15,000 lb → High (25 mi High, 0 Severe); 45,000 lb → Severe (25 mi Severe).
- **No Travel (peak 60 mph):** Route A reaches 64 mph and is No Travel at 0 lb; it ranks last. At 45,000 lb a 45 mph route becomes No Travel as well. On a short trip entirely inside the storm every route is No Travel and the warning "Every route has No Travel conditions…" appears.
- **Heatmap:** about half the grid is inside the band, with a fade zone at its edge; the storm centre moves steadily across the corridor over 0–48 h (about 0.2 grid cells per hour, largest single-hour jump about 0.3 cells).

---

## Deployment

The API runs on **Google Cloud Run** and the frontend on **Vercel**. Everything below is already configured in the repo.

```
Browser ──► Vercel (React, static)            VITE_API_URL is baked in at build time
   │
   └──────► Google Cloud Run (Django API)     CORS_ALLOWED_ORIGINS must include the Vercel address
                 └─► OSRM, Photon, Open-Meteo (free public services)
```

### Backend on Google Cloud Run
What is configured: `backend/Dockerfile` (Python 3.12, gunicorn, non-root user, listens on `$PORT`), `backend/.dockerignore`, and production-ready settings (HTTPS redirect with the health probe exempt, real client IP behind Google's proxy for rate limiting, secret key from Secret Manager, no debug). The service scales to zero when idle, so light use fits the free tier.

Requirements: the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install), `gcloud auth login`, and a Google Cloud project **with billing enabled** (Cloud Run and Cloud Build need it).

```powershell
.\deploy\deploy-backend.ps1 -ProjectId <your-gcp-project>
```

The script enables the needed APIs, creates the Django secret key in Secret Manager (first run only), builds the image with Cloud Build, deploys to Cloud Run (512 MiB, 0 to 3 instances, public access) and runs a health check. It prints the API URL, for example `https://weather-aware-truck-routing-api-123456.us-central1.run.app`. Re-running it updates the service in place.

### Frontend on Vercel
`frontend/vercel.json` already sets the build, the single-page rewrite and the security headers (including a Content-Security-Policy that allows calls to any https API and a Permissions-Policy that allows the site's own geolocation).

```powershell
npx vercel login                                   # first time only
.\deploy\deploy-frontend.ps1 -ApiUrl <cloud-run-url>
```

This builds the site with `VITE_API_URL` set to the API URL and deploys it to production. (You can also import the repo in the Vercel dashboard instead: set the root directory to `frontend` and add the environment variable `VITE_API_URL`.)

### Connect them (CORS)
The browser only lets the Vercel site call the API if the API allows that origin:

```powershell
.\deploy\set-cors.ps1 -ProjectId <your-gcp-project> -FrontendUrl https://<your-site>.vercel.app
```

This updates `CORS_ALLOWED_ORIGINS` on the running service (no rebuild). Pass several addresses separated by commas to allow a custom domain as well. Preview deployments on other `*.vercel.app` addresses are not allowed unless you add them.

### Notes
- **HTTPS is required** for GPS features; Vercel and Cloud Run both provide it.
- Leave `WEATHER_SCENARIO` unset in production. It is ignored when `DJANGO_DEBUG` is off.
- The cache is per instance (in memory). That is fine for this app; set `REDIS_URL` (for example a Memorystore instance) if you want a shared cache across instances.
- Cost: Cloud Run, Cloud Build and Secret Manager have free tiers that cover light use, but the project needs billing enabled. Set a budget alert in the Cloud console if you want a safety net.
- View logs with `gcloud run services logs read weather-aware-truck-routing-api --region us-central1`.

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `DJANGO_DEBUG` | backend | `1` for local development only |
| `DJANGO_SECRET_KEY` | backend | Required when debug is off |
| `DJANGO_ALLOWED_HOSTS` | backend | Comma-separated host names |
| `CORS_ALLOWED_ORIGINS` | backend | Frontend URL(s) allowed to call the API |
| `HTTP_USER_AGENT` | backend | Identifies the app to the free public APIs |
| `OSRM_BASE_URL`, `OPEN_METEO_BASE_URL`, `PHOTON_BASE_URL` | backend | Override the free public services |
| `REDIS_URL` | backend | Optional shared cache for multiple instances |
| `NUM_PROXIES` | backend | Trusted proxies in front of the app (the deploy script sets 1 on Cloud Run) so rate limits use each visitor's real IP |
| `DJANGO_SECURE_SSL_REDIRECT` | backend | `1` in production (default); the health probe is exempt |
| `WEATHER_SCENARIO` | backend | **Dev only.** `storm` turns on the simulated storm when `DJANGO_DEBUG=1` |
| `WEATHER_STORM_PEAK_MPH` | backend | Dev only. Storm peak wind, default 42 |
| `VITE_API_URL` | frontend | Base URL of the deployed Django API (production builds only) |
| `API_PROXY_TARGET` | frontend | Dev only. Backend the Vite dev server proxies `/api` to |

---

## Security

- **Strict validation:** unknown fields are rejected. Coordinates, load (0–80,000 lb), interval (10/25/50), departure window (now to +48 h, time zone required), trip length and the heatmap corridor (at most 3 lines of 1,500 points) are all bounded.
- **JSON only:** no browsable API, no form parsing, request bodies capped at 64 KB.
- **Rate limiting:** per-IP throttles on every endpoint.
- **Stateless:** no database, cookies, sessions or credentials. The only thing stored in the browser is the panel layout preference.
- **Safe errors:** upstream failures and unexpected errors return generic messages, never stack traces or third-party responses.
- **Outbound calls:** fixed hosts from settings, strict timeouts, limited retries, no redirects followed, response-size cap.
- **Production defaults:** debug off, secret key required, HTTPS redirect, HSTS, `nosniff`, `X-Frame-Options: DENY`, restricted CORS. The frontend sends a strict Content-Security-Policy and never injects HTML.
- **Location privacy:** the driver's position is used in the browser only (to draw the marker and follow the route). The only server call that includes it is the one-off address lookup when "Use my location" is pressed, and re-planning from the current position.
- `python manage.py check --deploy` passes.

---

## Assumptions and limitations

- "Sample weather every 10 / 25 / 50 miles" is a user-selectable checkpoint interval.
- The truck drives continuously at the routing engine's estimated speed. Rest stops, hours-of-service rules and truck-specific restrictions (height, weight, hazmat) are **not** modelled; the free OSRM server uses a car profile and has **no live traffic or road-closure data**, so ETAs and directions can differ from a commercial truck navigator.
- Where two ranges in the brief share a boundary value the higher, more cautious level is used.
- Forecasts reach about 48 hours ahead, which also limits how far ahead a departure can be planned.
- Route options are generated from OSRM alternatives and via-point detours. Some trips genuinely have fewer than three distinct routes; the app then says why.
- The heatmap is a coarse grid (cells of roughly 15–25 miles) smoothed by the browser. It shows broad weather patterns along the corridor, not street-level conditions.
- **GPS navigation is a driving aid, not a certified navigator.** It depends on the device's GPS accuracy, the browser's permission and (for voice) the browser's built-in speech synthesis, whose quality and availability vary. It was verified in the browser with a simulated GPS feed; test it on a real device before relying on it. Some roads have no name in the routing data and read as "the road".
- The free public services (OSRM, Photon, Open-Meteo) can be slow or rate-limit under load. The app caches aggressively and shows clear errors, but it has no paid-tier fallback.
- The simulated storm is a testing tool. It is not a weather model and never runs in production.
- Forecasts are guidance only; always follow official road and weather advisories.

---

## Author

**Atif Ullah Khan**
[GitHub](https://github.com/atifkhan23) · [LinkedIn](https://www.linkedin.com/in/atifullahkhan)
