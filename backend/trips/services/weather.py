"""Hourly forecasts from Open-Meteo (free, no API key).

Many points are fetched per request (Open-Meteo accepts comma-separated
coordinate lists) and each point's forecast is cached, so planning three routes
and a corridor heatmap costs only a handful of upstream calls.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterable, Sequence

from django.conf import settings
from django.core.cache import cache

from .geo import LonLat
from .http import UpstreamError, get_json

BATCH_SIZE = 50
FORECAST_DAYS = 4  # enough for a departure up to 48 h ahead plus the drive itself
CACHE_SECONDS = 30 * 60
MM_PER_INCH = 25.4
CM_PER_INCH = 2.54
HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"


@dataclass(frozen=True)
class HourlyForecast:
    times: tuple[int, ...]  # unix seconds, UTC, on the hour
    wind_mph: tuple[float, ...]
    gust_mph: tuple[float, ...]
    rain_in_hr: tuple[float, ...]
    snow_in_hr: tuple[float, ...]

    def index_for(self, unix_seconds: float) -> int | None:
        """Index of the forecast hour nearest to ``unix_seconds`` (None if outside range)."""
        if not self.times:
            return None
        start, end = self.times[0], self.times[-1]
        if unix_seconds < start - 1800 or unix_seconds > end + 1800:
            return None
        return min(len(self.times) - 1, max(0, round((unix_seconds - start) / 3600)))


def point_key(point: LonLat) -> LonLat:
    """Round to ~1 km so nearby samples share one forecast and one cache entry."""
    return (round(point[0], 2), round(point[1], 2))


def _num(values: Sequence | None, i: int) -> float:
    if not values or i >= len(values) or values[i] is None:
        return 0.0
    return float(values[i])


def _parse(item: dict) -> HourlyForecast:
    hourly = item.get("hourly") or {}
    times = tuple(int(t) for t in hourly.get("time") or [])
    n = len(times)
    rain = hourly.get("rain")
    showers = hourly.get("showers")
    return HourlyForecast(
        times=times,
        wind_mph=tuple(_num(hourly.get("wind_speed_10m"), i) for i in range(n)),
        gust_mph=tuple(_num(hourly.get("wind_gusts_10m"), i) for i in range(n)),
        # Liquid rain rate = rain + convective showers (mm) -> inches
        rain_in_hr=tuple((_num(rain, i) + _num(showers, i)) / MM_PER_INCH for i in range(n)),
        # Snowfall is reported in cm of fresh snow -> inches
        snow_in_hr=tuple(_num(hourly.get("snowfall"), i) / CM_PER_INCH for i in range(n)),
    )


def _cache_key(point: LonLat) -> str:
    hour_bucket = int(time.time() // 3600)
    return f"wx:{point[1]:.2f}:{point[0]:.2f}:{hour_bucket}"


def _fetch_batch(points: list[LonLat]) -> list[HourlyForecast]:
    params = {
        "latitude": ",".join(f"{p[1]:.2f}" for p in points),
        "longitude": ",".join(f"{p[0]:.2f}" for p in points),
        "hourly": HOURLY_VARS,
        "wind_speed_unit": "mph",
        "precipitation_unit": "mm",
        "timezone": "GMT",
        "timeformat": "unixtime",
        "forecast_days": FORECAST_DAYS,
    }
    data = get_json(f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params, "weather")
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points) or not all(isinstance(i, dict) for i in items):
        raise UpstreamError("The weather service returned an unexpected response.")
    return [_parse(item) for item in items]


def get_forecasts(points: Iterable[LonLat]) -> dict[LonLat, HourlyForecast]:
    """Forecasts keyed by ``point_key(point)`` for every requested point."""
    wanted = list(dict.fromkeys(point_key(p) for p in points))
    result: dict[LonLat, HourlyForecast] = {}
    keys = {p: _cache_key(p) for p in wanted}
    cached = cache.get_many(list(keys.values()))
    missing: list[LonLat] = []
    for p in wanted:
        hit = cached.get(keys[p])
        if hit is not None:
            result[p] = hit
        else:
            missing.append(p)

    for start in range(0, len(missing), BATCH_SIZE):
        batch = missing[start : start + BATCH_SIZE]
        forecasts = _fetch_batch(batch)
        cache.set_many({keys[p]: f for p, f in zip(batch, forecasts)}, CACHE_SECONDS)
        result.update(zip(batch, forecasts))
    return result


TZ_CACHE_SECONDS = 30 * 24 * 60 * 60


def get_timezone(point: LonLat) -> str | None:
    """IANA time zone name at ``point`` (e.g. ``America/Chicago``), or None if unavailable."""
    key = f"tz:{point[1]:.1f}:{point[0]:.1f}"
    cached = cache.get(key)
    if cached is not None:
        return cached or None
    params = {
        "latitude": f"{point[1]:.2f}",
        "longitude": f"{point[0]:.2f}",
        "hourly": "temperature_2m",
        "timezone": "auto",
        "forecast_days": 1,
    }
    try:
        data = get_json(f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params, "weather")
    except UpstreamError:
        return None
    name = data.get("timezone") if isinstance(data, dict) else None
    name = name if isinstance(name, str) and name else None
    cache.set(key, name or "", TZ_CACHE_SECONDS if name else 60)
    return name
