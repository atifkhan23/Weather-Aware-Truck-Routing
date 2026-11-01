"""Turns route options + forecasts into checkpoints, risk summaries and a recommendation."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Sequence

from . import scenario
from .geo import LonLat, Polyline, bbox, simplify
from .risk import Risk, assess
from .routing import RouteOption, get_route_options
from .weather import HourlyForecast, get_forecasts, get_timezone, point_key

ROUTE_NAMES = ("A", "B", "C")
LEVEL_KEYS = [r.key for r in Risk]


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    point: LonLat
    elapsed_seconds: float


def place_checkpoints(poly: Polyline, interval_miles: float) -> list[Checkpoint]:
    """A checkpoint at the origin, every ``interval_miles``, and at the destination."""
    if interval_miles <= 0:
        raise ValueError("interval_miles must be positive")
    total = poly.total_miles
    marks = [0.0]
    mile = interval_miles
    while mile < total:
        marks.append(mile)
        mile += interval_miles
    if total - marks[-1] > 0.05 or len(marks) == 1:
        marks.append(total)
    result = []
    for m in marks:
        point, seconds = poly.locate(m)
        result.append(Checkpoint(m, point, seconds))
    return result


def coverage(marks: Sequence[float], total: float) -> list[float]:
    """Miles of road each checkpoint represents: from the midpoint with the previous
    checkpoint to the midpoint with the next one. Sums to ``total``."""
    if not marks:
        return []
    if len(marks) == 1:
        return [total]
    spans = []
    for i, m in enumerate(marks):
        start = 0.0 if i == 0 else (marks[i - 1] + m) / 2
        end = total if i == len(marks) - 1 else (m + marks[i + 1]) / 2
        spans.append(max(0.0, end - start))
    return spans


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def evaluate_route(
    poly: Polyline,
    checkpoints: list[Checkpoint],
    departure_unix: float,
    load_lb: float,
    forecast_for: Callable[[LonLat], HourlyForecast | None],
) -> dict:
    spans = coverage([c.mile for c in checkpoints], poly.total_miles)
    miles_by_level = {k: 0.0 for k in LEVEL_KEYS}
    miles_by_level["unknown"] = 0.0
    weighted = 0.0
    known_miles = 0.0
    worst = Risk.LOW
    items = []

    for idx, (cp, span) in enumerate(zip(checkpoints, spans)):
        eta = departure_unix + cp.elapsed_seconds
        forecast = forecast_for(cp.point)
        hour = forecast.index_for(eta) if forecast else None
        item = {
            "index": idx,
            "mile": round(cp.mile, 1),
            "lat": round(cp.point[1], 5),
            "lon": round(cp.point[0], 5),
            "eta": _iso(eta),
            "covered_miles": round(span, 2),
        }
        if forecast is None or hour is None:
            item.update({"level": "unknown", "label": "No forecast", "reasons": ["Outside the forecast window"]})
            miles_by_level["unknown"] += span
        else:
            wind = forecast.wind_mph[hour]
            rain = forecast.rain_in_hr[hour]
            snow = forecast.snow_in_hr[hour]
            a = assess(wind, rain, snow, load_lb)
            item.update(
                {
                    "level": a.level.key,
                    "label": a.level.label,
                    "wind_mph": round(wind, 1),
                    "gust_mph": round(forecast.gust_mph[hour], 1),
                    "rain_in_hr": round(rain, 3),
                    "snow_in_hr": round(snow, 3),
                    "forecast_hour": _iso(forecast.times[hour]),
                    "reasons": list(a.reasons),
                    "levels": {
                        "wind": a.wind.key,
                        "rain": a.rain.key,
                        "snow": a.snow.key,
                        "load": a.load.key,
                    },
                }
            )
            miles_by_level[a.level.key] += span
            weighted += int(a.level) * span
            known_miles += span
            worst = max(worst, a.level)
        items.append(item)

    average = weighted / known_miles if known_miles else 0.0
    geometry = [[round(lat, 5), round(lon, 5)] for lon, lat in simplify(poly.coords, 0.2)]
    return {
        "distance_miles": round(poly.total_miles, 1),
        "duration_seconds": round(poly.total_seconds),
        "departure": _iso(departure_unix),
        "arrival": _iso(departure_unix + poly.total_seconds),
        "summary": {
            "miles_by_level": {k: round(v, 1) for k, v in miles_by_level.items()},
            "severe_miles": round(miles_by_level["severe"], 1),
            "high_miles": round(miles_by_level["high"], 1),
            "no_travel_miles": round(miles_by_level["no_travel"], 1),
            "unknown_miles": round(miles_by_level["unknown"], 1),
            "average_risk": round(average, 3),
            "max_level": worst.key if known_miles else "unknown",
        },
        "checkpoints": items,
        "geometry": geometry,
    }


def rank_key(route: dict) -> tuple:
    """Ordering from the brief, with No Travel segments ruled out first."""
    s = route["summary"]
    return (
        s["no_travel_miles"] > 0,
        round(s["severe_miles"], 1),
        round(s["high_miles"], 1),
        round(s["average_risk"], 2),
        route["duration_seconds"],
    )


def _fmt_duration(seconds: float) -> str:
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60} h {minutes % 60:02d} min"


def explain(best: dict, runner_up: dict | None) -> str:
    """One sentence on why ``best`` beat the next route, using the first criterion that differs."""
    name = f"Route {best['name']}"
    if runner_up is None:
        return f"{name} is the only route available."
    b, r = best["summary"], runner_up["summary"]
    other = f"Route {runner_up['name']}"
    if (b["no_travel_miles"] > 0) != (r["no_travel_miles"] > 0):
        return f"{name} avoids the No Travel conditions forecast on {other}."
    if round(b["severe_miles"], 1) != round(r["severe_miles"], 1):
        return f"{name} has the fewest Severe miles ({b['severe_miles']:g} vs {r['severe_miles']:g} on {other})."
    if round(b["high_miles"], 1) != round(r["high_miles"], 1):
        return f"{name} has the fewest High-risk miles ({b['high_miles']:g} vs {r['high_miles']:g} on {other})."
    if round(b["average_risk"], 2) != round(r["average_risk"], 2):
        return f"{name} has the lowest average weather risk ({b['average_risk']:.2f} vs {r['average_risk']:.2f})."
    saved = runner_up["duration_seconds"] - best["duration_seconds"]
    if saved > 0:
        return f"Weather risk is equal, and {name} is {_fmt_duration(saved)} faster than {other}."
    return f"{name} matches the others on risk and travel time."


def reason_for(best: dict, ordered: list[dict]) -> str:
    """The one-line reason shown to the driver.

    It says why best beat the next route and, when best is not the fastest
    route, also why the faster one was passed over. Wording only; ranking is untouched.
    """
    text = explain(best, ordered[1] if len(ordered) > 1 else None)
    fastest = min(ordered, key=lambda r: r["duration_seconds"])
    if fastest["id"] == best["id"]:
        return text
    f = fastest["summary"]
    if f["no_travel_miles"] > 0:
        why = f"has {f['no_travel_miles']:g} mi of No Travel weather"
    elif f["severe_miles"] > 0:
        why = f"has {f['severe_miles']:g} mi of Severe weather"
    elif f["high_miles"] > 0:
        why = f"has {f['high_miles']:g} mi of High-risk weather"
    else:
        why = "carries a higher average weather risk"
    slower = best["duration_seconds"] - fastest["duration_seconds"]
    return f"{text} It is {_fmt_duration(slower)} slower than the fastest route (Route {fastest['name']}), which {why}."


def build_plan(
    options: list[RouteOption],
    departure_unix: float,
    load_lb: float,
    interval_miles: float,
    forecasts: dict[LonLat, HourlyForecast],
) -> dict:
    routes = []
    for name, option in zip(ROUTE_NAMES, options):
        checkpoints = place_checkpoints(option.polyline, interval_miles)
        route = evaluate_route(
            option.polyline,
            checkpoints,
            departure_unix,
            load_lb,
            lambda p: forecasts.get(point_key(p)),
        )
        route["name"] = name
        route["id"] = name.lower()
        route["source"] = option.source
        route["steps"] = list(option.steps)
        routes.append(route)

    ordered = sorted(routes, key=rank_key)
    for rank, route in enumerate(ordered, start=1):
        route["rank"] = rank
    best = ordered[0]
    all_blocked = all(r["summary"]["no_travel_miles"] > 0 for r in routes)

    all_coords: list[LonLat] = [(lon, lat) for r in routes for lat, lon in r["geometry"]]
    min_lon, min_lat, max_lon, max_lat = bbox(all_coords)
    return {
        "routes": routes,
        "recommended_id": best["id"],
        "recommendation": {
            "route_id": best["id"],
            "reason": reason_for(best, ordered),
            "warning": (
                "Every route has No Travel conditions at this departure time. "
                "Consider leaving at a different time."
                if all_blocked
                else None
            ),
        },
        "bounds": {"south": min_lat, "west": min_lon, "north": max_lat, "east": max_lon},
    }


def shortfall_notice(count: int) -> str | None:
    """Why the driver is seeing fewer than three route options (None when all three were found)."""
    if count >= len(ROUTE_NAMES):
        return None
    found = "only one drivable route" if count == 1 else f"only {count} distinct routes"
    return (
        f"We found {found} between these places. Other candidate roads either overlapped an existing route "
        "almost completely or added more than 60% to the distance, so they were not offered."
    )


def plan_trip(
    origin: LonLat,
    destination: LonLat,
    departure_unix: float,
    load_lb: float,
    interval_miles: float,
) -> dict:
    options = get_route_options(origin, destination)
    points = [
        cp.point
        for option in options
        for cp in place_checkpoints(option.polyline, interval_miles)
    ]
    forecasts = get_forecasts(points)
    storm = None
    if scenario.enabled():
        storm = scenario.storm_for(options[0].polyline)
        forecasts = scenario.apply(forecasts, storm)
    plan = build_plan(options, departure_unix, load_lb, interval_miles, forecasts)
    if storm is not None:
        scenario.remember(storm, plan["bounds"])
        plan["simulation"] = scenario.describe()
    plan["route_notice"] = shortfall_notice(len(options))
    plan["inputs"] = {
        "departure": _iso(departure_unix),
        "load_lb": load_lb,
        "interval_miles": interval_miles,
        "timezone": get_timezone(origin) or "UTC",
    }
    return plan
