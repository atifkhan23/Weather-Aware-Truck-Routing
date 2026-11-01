"""Route options from OSRM (open source, no key needed).

OSRM returns the fastest route plus, when it finds them, up to two alternatives.
When fewer than three distinct routes come back, we ask for routes through a
"via" point pushed to either side of the straight line between origin and
destination. That reliably produces different corridors, which is what a
driver comparing weather exposure actually needs.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from django.conf import settings
from django.core.cache import cache

from .geo import METERS_PER_MILE, LonLat, Polyline, build_polyline, haversine_miles, offset_midpoint
from .http import UpstreamError, get_json

ROUTE_COUNT = 3
VIA_OFFSETS = (0.18, -0.18, 0.32, -0.32, 0.12, -0.12, 0.5, -0.5)
CACHE_SECONDS = 60 * 60


@dataclass(frozen=True)
class RouteOption:
    polyline: Polyline
    source: str  # "fastest", "alternative" or "via"
    # Turn-by-turn directions for the driver; empty when the routing service sent none.
    steps: tuple = field(default=())


def _osrm(points: list[LonLat], alternatives: bool) -> list[dict]:
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in points)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "duration",
        "steps": "true",
        "alternatives": "3" if alternatives else "false",
    }
    cache_key = f"osrm:v2:{coords}:{alternatives}"
    data = cache.get(cache_key)
    if data is None:
        data = get_json(url, params, "routing")
        if isinstance(data, dict) and data.get("code") == "Ok":
            cache.set(cache_key, data, CACHE_SECONDS)
    if not isinstance(data, dict):
        raise UpstreamError("The routing service returned an invalid response.")
    if data.get("code") == "NoRoute":
        return []
    if data.get("code") != "Ok":
        raise UpstreamError("No drivable route could be found between these places.", 422)
    return data.get("routes") or []


def _to_polyline(route: dict) -> Polyline:
    coords = [(float(x), float(y)) for x, y in route["geometry"]["coordinates"]]
    seg_seconds: list[float] = []
    for leg in route.get("legs", []):
        seg_seconds.extend(leg.get("annotation", {}).get("duration", []))
    # Legs share their joining vertex, so annotation counts match only when
    # the geometry is one continuous list. Fall back to proportional timing.
    if len(seg_seconds) != len(coords) - 1:
        seg_seconds = None  # type: ignore[assignment]
    return build_polyline(coords, seg_seconds, float(route.get("duration", 0.0)))


def _steps(route: dict) -> tuple:
    """Driver-facing maneuvers in route order (OSRM "steps"), with distances in miles."""
    out = []
    for leg in route.get("legs", []):
        for step in leg.get("steps") or []:
            maneuver = step.get("maneuver") or {}
            location = maneuver.get("location")
            if not (isinstance(location, list) and len(location) >= 2):
                continue
            out.append(
                {
                    "type": str(maneuver.get("type", "")),
                    "modifier": str(maneuver.get("modifier", "")),
                    "exit": maneuver.get("exit"),
                    "name": str(step.get("name") or ""),
                    "ref": str(step.get("ref") or ""),
                    "distance_miles": round(float(step.get("distance", 0.0)) / METERS_PER_MILE, 2),
                    "duration_seconds": round(float(step.get("duration", 0.0))),
                    "lat": round(float(location[1]), 5),
                    "lon": round(float(location[0]), 5),
                }
            )
    return tuple(out)


def _overlap(a: Polyline, b: Polyline, samples: int = 24, tolerance_miles: float = 2.0) -> float:
    """Share of points along ``a`` that lie close to ``b`` (0..1)."""
    b_points = b.coords[:: max(1, len(b.coords) // 400)]
    near = 0
    for i in range(1, samples):
        point, _ = a.locate(a.total_miles * i / samples)
        if any(haversine_miles(point, q) <= tolerance_miles for q in b_points):
            near += 1
    return near / (samples - 1)


def _is_distinct(candidate: Polyline, chosen: list[RouteOption]) -> bool:
    return all(_overlap(candidate, r.polyline) < 0.85 for r in chosen)


def get_route_options(origin: LonLat, destination: LonLat) -> list[RouteOption]:
    routes = _osrm([origin, destination], alternatives=True)
    if not routes:
        raise UpstreamError("No drivable route could be found between these places.", 422)

    options: list[RouteOption] = []
    for i, raw in enumerate(routes):
        poly = _to_polyline(raw)
        if not options or _is_distinct(poly, options):
            options.append(RouteOption(poly, "fastest" if i == 0 else "alternative", _steps(raw)))
        if len(options) == ROUTE_COUNT:
            return options

    fastest = options[0].polyline
    for fraction in VIA_OFFSETS:
        via = offset_midpoint(origin, destination, fraction)
        try:
            via_routes = _osrm([origin, via, destination], alternatives=False)
        except UpstreamError:
            continue
        if not via_routes:
            continue
        poly = _to_polyline(via_routes[0])
        # Skip silly detours (more than 60% longer than the fastest route).
        if poly.total_miles > fastest.total_miles * 1.6:
            continue
        if _is_distinct(poly, options):
            options.append(RouteOption(poly, "via", _steps(via_routes[0])))
        if len(options) == ROUTE_COUNT:
            break
    return options
