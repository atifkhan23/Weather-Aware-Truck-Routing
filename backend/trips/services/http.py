"""Shared HTTP client for third-party APIs: timeouts, retries, safe errors."""
from __future__ import annotations

import logging
import threading
from typing import Any

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

TIMEOUT = (5, 20)  # (connect, read) seconds
MAX_RESPONSE_BYTES = 15 * 1024 * 1024

_local = threading.local()


class UpstreamError(Exception):
    """A third-party service failed. The message is safe to show to users."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _session() -> requests.Session:
    session = getattr(_local, "session", None)
    if session is None:
        session = requests.Session()
        retry = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}),
            respect_retry_after_header=True,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        session.headers.update({"User-Agent": settings.HTTP_USER_AGENT, "Accept": "application/json"})
        _local.session = session
    return session


def get_json(url: str, params: dict[str, Any], service: str) -> Any:
    """GET a JSON document. Never leaks upstream details to API clients."""
    try:
        response = _session().get(url, params=params, timeout=TIMEOUT, allow_redirects=False)
    except requests.RequestException as exc:
        logger.warning("%s request failed: %s", service, exc)
        raise UpstreamError(f"The {service} service is unreachable. Please try again.") from exc

    if response.status_code == 429:
        raise UpstreamError(f"The {service} service is busy. Please try again in a minute.", 503)
    if response.status_code >= 400:
        logger.warning("%s returned HTTP %s: %s", service, response.status_code, response.text[:300])
        raise UpstreamError(f"The {service} service returned an error.")
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise UpstreamError(f"The {service} response was too large.")
    try:
        return response.json()
    except ValueError as exc:
        raise UpstreamError(f"The {service} service returned an invalid response.") from exc
