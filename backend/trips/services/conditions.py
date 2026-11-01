"""Current wind at a few freight hubs, for the landing page.

Reuses the cached hourly forecasts, so a page load costs at most one upstream call.
"""
from __future__ import annotations

import time

from django.core.cache import cache

from .risk import wind_risk
from .weather import get_forecasts, point_key

CACHE_SECONDS = 10 * 60

# (name, lon, lat)
HUBS = (
    ("Dallas", -96.80, 32.78),
    ("Chicago", -87.63, 41.88),
    ("Denver", -104.99, 39.74),
    ("Atlanta", -84.39, 33.75),
    ("Los Angeles", -118.24, 34.05),
    ("Seattle", -122.33, 47.61),
)


def current_conditions() -> list[dict]:
    """Wind now at each hub; hubs whose forecast is unavailable are left out."""
    cached = cache.get("conditions:v1")
    if cached is not None:
        return cached

    forecasts = get_forecasts([(lon, lat) for _, lon, lat in HUBS])
    now = time.time()
    rows = []
    for name, lon, lat in HUBS:
        forecast = forecasts.get(point_key((lon, lat)))
        hour = forecast.index_for(now) if forecast else None
        if forecast is None or hour is None:
            continue
        mph = forecast.wind_mph[hour]
        level = wind_risk(mph)
        rows.append({"name": name, "wind_mph": round(mph, 1), "level": level.key, "label": level.label})

    cache.set("conditions:v1", rows, CACHE_SECONDS)
    return rows
