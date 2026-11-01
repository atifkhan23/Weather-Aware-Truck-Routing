"""Small, dependency-free geometry helpers (WGS84, miles)."""
from __future__ import annotations

import math
from bisect import bisect_left
from dataclasses import dataclass
from typing import Sequence

EARTH_RADIUS_MILES = 3958.7613
METERS_PER_MILE = 1609.344

LonLat = tuple[float, float]


def haversine_miles(a: LonLat, b: LonLat) -> float:
    """Great-circle distance between two (lon, lat) points in miles."""
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1.0, math.sqrt(h)))


@dataclass(frozen=True)
class Polyline:
    """A route line with cumulative distance (miles) and time (seconds) per vertex."""

    coords: tuple[LonLat, ...]
    cum_miles: tuple[float, ...]
    cum_seconds: tuple[float, ...]

    @property
    def total_miles(self) -> float:
        return self.cum_miles[-1]

    @property
    def total_seconds(self) -> float:
        return self.cum_seconds[-1]

    def locate(self, miles: float) -> tuple[LonLat, float]:
        """Point and elapsed seconds at ``miles`` along the line (clamped to its ends)."""
        miles = max(0.0, min(miles, self.total_miles))
        i = bisect_left(self.cum_miles, miles)
        if i <= 0:
            return self.coords[0], self.cum_seconds[0]
        if i >= len(self.coords):
            return self.coords[-1], self.cum_seconds[-1]
        d0, d1 = self.cum_miles[i - 1], self.cum_miles[i]
        t = 0.0 if d1 == d0 else (miles - d0) / (d1 - d0)
        (x0, y0), (x1, y1) = self.coords[i - 1], self.coords[i]
        point = (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
        seconds = self.cum_seconds[i - 1] + (self.cum_seconds[i] - self.cum_seconds[i - 1]) * t
        return point, seconds


def build_polyline(
    coords: Sequence[LonLat],
    segment_seconds: Sequence[float] | None = None,
    total_seconds: float | None = None,
) -> Polyline:
    """Build a Polyline. Per-segment durations are used when given, otherwise the
    total duration is spread over the line in proportion to distance."""
    if len(coords) < 2:
        raise ValueError("A route needs at least two points.")
    cum_miles = [0.0]
    for a, b in zip(coords, coords[1:]):
        cum_miles.append(cum_miles[-1] + haversine_miles(a, b))

    if segment_seconds is not None and len(segment_seconds) == len(coords) - 1:
        cum_seconds = [0.0]
        for s in segment_seconds:
            cum_seconds.append(cum_seconds[-1] + max(0.0, float(s)))
    else:
        total = float(total_seconds or 0.0)
        length = cum_miles[-1] or 1.0
        cum_seconds = [total * d / length for d in cum_miles]

    return Polyline(tuple(map(tuple, coords)), tuple(cum_miles), tuple(cum_seconds))


def simplify(coords: Sequence[LonLat], min_step_miles: float = 0.25) -> list[LonLat]:
    """Drop vertices closer than ``min_step_miles`` to the last kept one (keeps ends)."""
    if len(coords) <= 2:
        return list(coords)
    kept = [coords[0]]
    for point in coords[1:-1]:
        if haversine_miles(kept[-1], point) >= min_step_miles:
            kept.append(point)
    kept.append(coords[-1])
    return kept


def offset_midpoint(a: LonLat, b: LonLat, fraction: float) -> LonLat:
    """Midpoint of a-b pushed sideways by ``fraction`` of the a-b length.

    Used to ask the router for a genuinely different corridor ("via" point).
    Works in a local equirectangular frame, which is accurate enough here.
    """
    mid_lat = (a[1] + b[1]) / 2
    kx = math.cos(math.radians(mid_lat))
    ax, ay = a[0] * kx, a[1]
    bx, by = b[0] * kx, b[1]
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    # Perpendicular vector, same length as a-b.
    px, py = -dy, dx
    ox, oy = mx + px * fraction, my + py * fraction
    return (ox / kx if kx else ox, max(-89.9, min(89.9, oy)))


def bbox(points: Sequence[LonLat]) -> tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat)."""
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return min(lons), min(lats), max(lons), max(lats)
