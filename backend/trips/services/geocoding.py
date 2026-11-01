"""Place search for the origin/destination fields, via Photon (OpenStreetMap data)."""
from __future__ import annotations

import hashlib

from django.conf import settings
from django.core.cache import cache

from .http import UpstreamError, get_json

CACHE_SECONDS = 24 * 60 * 60
MAX_RESULTS = 6


def _label(props: dict) -> str:
    parts = [
        props.get("name"),
        props.get("city") if props.get("city") != props.get("name") else None,
        props.get("state"),
        props.get("country"),
    ]
    seen: list[str] = []
    for part in parts:
        if part and part not in seen:
            seen.append(str(part))
    return ", ".join(seen)


def search_places(query: str) -> list[dict]:
    key = "geo:" + hashlib.sha256(query.lower().encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached

    data = get_json(
        f"{settings.PHOTON_BASE_URL}/api/",
        {"q": query, "limit": MAX_RESULTS, "lang": "en"},
        "place search",
    )
    if not isinstance(data, dict):
        raise UpstreamError("The place search service returned an invalid response.")

    results: list[dict] = []
    seen_labels: set[str] = set()
    for feature in data.get("features", [])[:MAX_RESULTS]:
        try:
            lon, lat = feature["geometry"]["coordinates"][:2]
            props = feature.get("properties") or {}
        except (KeyError, TypeError, ValueError):
            continue
        label = _label(props)
        if not label or label in seen_labels:
            continue
        seen_labels.add(label)
        results.append({"label": label, "lat": float(lat), "lon": float(lon)})

    cache.set(key, results, CACHE_SECONDS)
    return results


def reverse_place(lat: float, lon: float) -> dict | None:
    """The nearest named place to a point, for turning a GPS fix into an address label."""
    key = f"rev:{lat:.3f}:{lon:.3f}"
    cached = cache.get(key)
    if cached is not None:
        return cached or None

    data = get_json(
        f"{settings.PHOTON_BASE_URL}/reverse",
        {"lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "lang": "en", "limit": 1},
        "place search",
    )
    place = None
    if isinstance(data, dict):
        for feature in data.get("features", [])[:1]:
            props = feature.get("properties") or {}
            label = _label(props)
            if label:
                place = {"label": label, "lat": lat, "lon": lon}
    cache.set(key, place or "", CACHE_SECONDS)
    return place


def reverse_place(lat: float, lon: float) -> dict | None:
    """The nearest named place to a point, for turning a GPS fix into an address label."""
    key = f"rev:{lat:.3f}:{lon:.3f}"
    cached = cache.get(key)
    if cached is not None:
        return cached or None

    data = get_json(
        f"{settings.PHOTON_BASE_URL}/reverse",
        {"lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "lang": "en", "limit": 1},
        "place search",
    )
    place = None
    if isinstance(data, dict):
        for feature in data.get("features", [])[:1]:
            props = feature.get("properties") or {}
            label = _label(props)
            if label:
                place = {"label": label, "lat": lat, "lon": lon}
    cache.set(key, place or "", CACHE_SECONDS)
    return place
