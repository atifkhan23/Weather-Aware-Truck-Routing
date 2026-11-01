"""LOCAL-DEV-ONLY weather simulation, used to prove the risk logic end to end.

A moving storm is laid over the fastest route: wind and rain peak at the storm's
centre and fall off smoothly with distance, and the centre drifts along the route
over 48 hours. Routes that stay away from it are left alone, so the planner has a
real reason to prefer a slower, calmer road.

It can only run when ``DJANGO_DEBUG=1`` *and* ``WEATHER_SCENARIO=storm``. In any
other configuration ``enabled()`` is False and nothing here touches the forecast.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, replace

from django.conf import settings
from django.core.cache import cache

from .geo import LonLat, Polyline, haversine_miles
from .weather import HourlyForecast

SCENARIO_NAME = "storm"
LABEL = "Simulated weather (dev only)"
HOURS_SPAN = 48.0
START_FRACTION = 0.20  # where along the fastest route the storm is at hour 0
END_FRACTION = 0.80  # ...and at hour 48
RAIN_AT_PEAK_IN_HR = 0.30
GUST_FACTOR = 1.3
CACHE_SECONDS = 60 * 60


def enabled() -> bool:
    """True only in local development with the storm scenario switched on."""
    return bool(settings.DEBUG) and getattr(settings, "WEATHER_SCENARIO", "") == SCENARIO_NAME


def describe() -> dict:
    peak = float(getattr(settings, "WEATHER_STORM_PEAK_MPH", 42.0))
    return {
        "scenario": SCENARIO_NAME,
        "label": LABEL,
        "detail": f"A storm with winds up to about {peak:.0f} mph is drifting along the fastest route.",
    }


@dataclass(frozen=True)
class Storm:
    route: Polyline
    radius_miles: float
    peak_mph: float
    anchor: int  # unix seconds of hour 0 (the start of the current hour)

    def center(self, hours: float) -> LonLat:
        fraction = START_FRACTION + (END_FRACTION - START_FRACTION) * max(0.0, min(HOURS_SPAN, hours)) / HOURS_SPAN
        point, _ = self.route.locate(self.route.total_miles * fraction)
        return point

    def strength(self, point: LonLat, hours: float) -> float:
        """0..1: how hard the storm hits ``point`` at ``hours`` after the anchor."""
        d = haversine_miles(point, self.center(hours))
        return math.exp(-((d / self.radius_miles) ** 2))


def storm_for(route: Polyline, now: float | None = None) -> Storm:
    anchor = int((time.time() if now is None else now) // 3600) * 3600
    radius = max(30.0, min(70.0, 0.18 * route.total_miles))
    return Storm(route, radius, float(getattr(settings, "WEATHER_STORM_PEAK_MPH", 42.0)), anchor)


def apply(forecasts: dict[LonLat, HourlyForecast], storm: Storm) -> dict[LonLat, HourlyForecast]:
    """A copy of ``forecasts`` with the storm added. The real forecasts are never modified."""
    centers: dict[int, LonLat] = {}
    out: dict[LonLat, HourlyForecast] = {}
    for point, f in forecasts.items():
        wind, gust, rain = [], [], []
        for i, ts in enumerate(f.times):
            hours = (ts - storm.anchor) / 3600.0
            key = int(round(hours))
            if key not in centers:
                centers[key] = storm.center(hours)
            d = haversine_miles(point, centers[key])
            share = math.exp(-((d / storm.radius_miles) ** 2))
            wind.append(f.wind_mph[i] + storm.peak_mph * share)
            gust.append(f.gust_mph[i] + storm.peak_mph * share * GUST_FACTOR)
            rain.append(f.rain_in_hr[i] + RAIN_AT_PEAK_IN_HR * share)
        out[point] = replace(f, wind_mph=tuple(wind), gust_mph=tuple(gust), rain_in_hr=tuple(rain))
    return out


def _key(south: float, west: float, north: float, east: float) -> str:
    return "storm:" + ":".join(f"{v:.1f}" for v in (south, west, north, east))


def remember(storm: Storm, bounds: dict) -> None:
    """Keep the storm so the heatmap for the same trip shows the same weather."""
    cache.set(_key(bounds["south"], bounds["west"], bounds["north"], bounds["east"]), storm, CACHE_SECONDS)


def recall(south: float, west: float, north: float, east: float) -> Storm | None:
    return cache.get(_key(south, west, north, east))
