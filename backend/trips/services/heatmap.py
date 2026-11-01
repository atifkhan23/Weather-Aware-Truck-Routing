"""Gridded 0-48 h weather risk over the trip corridor.

All 49 hours are returned in one response so the frontend slider only redraws;
it never waits on the network while the user scrubs through time.
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone

from . import scenario
from .risk import assess, risk_score
from .weather import get_forecasts, point_key

HOURS = 49  # 0..48 inclusive
TARGET_CELLS = 320
MAX_SIDE = 24
PAD_FRACTION = 0.08
MIN_PAD_DEGREES = 0.25


def grid_shape(width_deg: float, height_deg: float, target: int = TARGET_CELLS) -> tuple[int, int]:
    """(rows, cols) with roughly square cells and about ``target`` cells in total."""
    width_deg = max(width_deg, 1e-6)
    height_deg = max(height_deg, 1e-6)
    aspect = width_deg / height_deg
    rows = max(2, min(MAX_SIDE, round(math.sqrt(target / aspect))))
    cols = max(2, min(MAX_SIDE, round(target / rows)))
    return rows, cols


BAND_FULL_MILES = 25.0  # full strength this close to a route
BAND_FADE_MILES = 40.0  # fades to nothing by here
MILES_PER_DEG_LAT = 69.05


def _segment_miles(lat: float, lon: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance in miles from a point to the segment a-b ([lat, lon] pairs), on a local flat projection."""
    kx = math.cos(math.radians(lat)) * MILES_PER_DEG_LAT
    ax, ay = (a[1] - lon) * kx, (a[0] - lat) * MILES_PER_DEG_LAT
    bx, by = (b[1] - lon) * kx, (b[0] - lat) * MILES_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / len2))
    return math.hypot(ax + t * dx, ay + t * dy)


def corridor_weight(lat: float, lon: float, corridor: list[list[list[float]]]) -> float:
    """1 within 25 miles of any route, easing smoothly to 0 at 40 miles."""
    nearest = min(
        (_segment_miles(lat, lon, line[i], line[i + 1]) for line in corridor for i in range(len(line) - 1)),
        default=math.inf,
    )
    if nearest <= BAND_FULL_MILES:
        return 1.0
    if nearest >= BAND_FADE_MILES:
        return 0.0
    x = (BAND_FADE_MILES - nearest) / (BAND_FADE_MILES - BAND_FULL_MILES)
    return x * x * (3 - 2 * x)  # smoothstep


def build_heatmap(
    south: float,
    west: float,
    north: float,
    east: float,
    load_lb: float,
    corridor: list[list[list[float]]] | None = None,
) -> dict:
    request_bounds = (south, west, north, east)
    if corridor:
        # Leave room for the whole band around the routes.
        band_lat = BAND_FADE_MILES / MILES_PER_DEG_LAT
        band_lon = band_lat / max(0.2, math.cos(math.radians((south + north) / 2)))
        south, north = south - band_lat, north + band_lat
        west, east = west - band_lon, east + band_lon
    pad_lat = max(MIN_PAD_DEGREES, (north - south) * PAD_FRACTION)
    pad_lon = max(MIN_PAD_DEGREES, (east - west) * PAD_FRACTION)
    south, north = max(-85.0, south - pad_lat), min(85.0, north + pad_lat)
    west, east = max(-180.0, west - pad_lon), min(180.0, east + pad_lon)

    mid_lat = math.radians((south + north) / 2)
    rows, cols = grid_shape((east - west) * math.cos(mid_lat), north - south)
    lat_step = (north - south) / rows
    lon_step = (east - west) / cols

    centers = [
        (west + (c + 0.5) * lon_step, south + (r + 0.5) * lat_step)
        for r in range(rows)
        for c in range(cols)
    ]
    # Cells outside the band are never fetched: they carry no data and stay transparent.
    if corridor:
        weights = [corridor_weight(lat, lon, corridor) for lon, lat in centers]
    else:
        weights = [1.0] * len(centers)
    wanted = [c for c, w in zip(centers, weights) if w > 0]
    forecasts = get_forecasts(wanted) if wanted else {}

    storm = scenario.recall(*request_bounds) if scenario.enabled() else None
    if storm is not None:
        forecasts = scenario.apply(forecasts, storm)

    now_hour = int(time.time() // 3600) * 3600
    levels: list[list[int]] = []
    scores: list[list[float]] = []
    for h in range(HOURS):
        ts = now_hour + h * 3600
        row_levels: list[int] = []
        row_scores: list[float] = []
        for center, weight in zip(centers, weights):
            f = forecasts.get(point_key(center)) if weight > 0 else None
            i = f.index_for(ts) if f else None
            if f is None or i is None:
                row_levels.append(-1)
                row_scores.append(-1.0)
                continue
            wind, rain, snow = f.wind_mph[i], f.rain_in_hr[i], f.snow_in_hr[i]
            row_levels.append(int(assess(wind, rain, snow, load_lb).level))
            row_scores.append(round(risk_score(wind, rain, snow, load_lb), 2))
        levels.append(row_levels)
        scores.append(row_scores)

    result = {
        "start": datetime.fromtimestamp(now_hour, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "hours": HOURS,
        "rows": rows,
        "cols": cols,
        "bounds": {"south": south, "west": west, "north": north, "east": east},
        # Row-major from the south-west corner: index = row * cols + col.
        "levels": levels,
        "scores": scores,
        # 0..1 per cell (same order as above): how strongly the overlay shows, fading toward the band edge.
        "mask": [round(w, 2) for w in weights],
    }
    if storm is not None:
        result["simulation"] = scenario.describe()
    return result
