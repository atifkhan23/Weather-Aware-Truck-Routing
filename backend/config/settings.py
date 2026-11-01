"""Django settings for the Weather-Aware Truck Routing API.

Everything environment-specific comes from environment variables (or a local
``.env`` file). Defaults are safe for production: DEBUG is off and a secret key
must be provided explicitly.
"""
from __future__ import annotations

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines, existing env vars win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(int(default))).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "insecure-local-development-key-only"  # noqa: S105 - dev only
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# The API is stateless: no database, sessions, users or admin are needed.
DATABASES: dict = {}

TEMPLATES: list = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Caching -------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "wtr-cache",
            "OPTIONS": {"MAX_ENTRIES": 5000},
        }
    }

# --- Django REST Framework ----------------------------------------------
REST_FRAMEWORK = {
    # JSON only: no browsable API, no form parsing.
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    # Public, read-only style API: no sessions or credentials are accepted.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON", "120/min"),
        "plan": os.environ.get("THROTTLE_PLAN", "20/min"),
        "heatmap": os.environ.get("THROTTLE_HEATMAP", "20/min"),
        "geocode": os.environ.get("THROTTLE_GEOCODE", "90/min"),
    },
    "EXCEPTION_HANDLER": "trips.exceptions.api_exception_handler",
    # Number of trusted proxies in front of the app (1 on Google Cloud Run, 0 when run directly).
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0")) or None,
}

# Requests are small JSON bodies; reject anything large early.
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024

# --- CORS ----------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]
CORS_ALLOW_CREDENTIALS = False
CORS_URLS_REGEX = r"^/api/.*$"

# --- Security headers ----------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

if not DEBUG:
    # Most hosts terminate TLS at a proxy and forward this header.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = False
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

SILENCED_SYSTEM_CHECKS = [
    # CSRF protects cookie-authenticated requests. This API sets no cookies and
    # accepts no credentials (no sessions, no auth), so there is nothing to forge.
    "security.W003",
    # HSTS preload is a one-way commitment for a whole domain; opt in per deployment.
    "security.W021",
]

# --- Local-dev weather simulation --------------------------------------------
# Honoured only when DJANGO_DEBUG=1. With DEBUG off the value is forced to "", so
# a stray environment variable on a production host cannot enable it.
WEATHER_SCENARIO = os.environ.get("WEATHER_SCENARIO", "").strip().lower() if DEBUG else ""
WEATHER_STORM_PEAK_MPH = float(os.environ.get("WEATHER_STORM_PEAK_MPH", "42"))

# --- External services ---------------------------------------------------
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
OPEN_METEO_BASE_URL = os.environ.get("OPEN_METEO_BASE_URL", "https://api.open-meteo.com").rstrip("/")
PHOTON_BASE_URL = os.environ.get("PHOTON_BASE_URL", "https://photon.komoot.io").rstrip("/")
HTTP_USER_AGENT = os.environ.get(
    "HTTP_USER_AGENT", "WeatherAwareTruckRouting/1.0 (+https://github.com/atifkhan23)"
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
