from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from trips.services.http import UpstreamError

ORIGIN = {"lat": 41.8781, "lon": -87.6298, "label": "Chicago, IL"}
DEST = {"lat": 39.7684, "lon": -86.1581, "label": "Indianapolis, IN"}


def payload(**overrides):
    body = {
        "origin": ORIGIN,
        "destination": DEST,
        "departure_time": (timezone.now() + timedelta(hours=2)).isoformat(),
        "load_weight_lb": 32000,
        "checkpoint_interval_miles": 25,
    }
    body.update(overrides)
    return body


def fake_osrm(coords_count_line=40):
    """An OSRM-like response for a straight Chicago -> Indianapolis line."""
    n = coords_count_line
    coords = [
        [ORIGIN["lon"] + (DEST["lon"] - ORIGIN["lon"]) * i / (n - 1),
         ORIGIN["lat"] + (DEST["lat"] - ORIGIN["lat"]) * i / (n - 1)]
        for i in range(n)
    ]
    return {
        "code": "Ok",
        "routes": [{
            "geometry": {"coordinates": coords},
            "duration": 3 * 3600,
            "distance": 290000,
            "legs": [{"annotation": {"duration": [3 * 3600 / (n - 1)] * (n - 1)}}],
        }],
    }


def fake_open_meteo(params):
    lats = params["latitude"].split(",")
    import time as _t
    start = int(_t.time() // 3600) * 3600 - 3600
    hours = 96
    item = {
        "hourly": {
            "time": [start + h * 3600 for h in range(hours)],
            "wind_speed_10m": [12.0] * hours,
            "wind_gusts_10m": [20.0] * hours,
            "rain": [0.5] * hours,
            "showers": [0.0] * hours,
            "snowfall": [0.0] * hours,
        }
    }
    return [item for _ in lats] if len(lats) > 1 else item


def fake_get_json(url, params, service):
    if "/route/v1/" in url:
        return fake_osrm()
    if "/v1/forecast" in url:
        return fake_open_meteo(params)
    if "/api/" in url:
        return {"features": [{"geometry": {"coordinates": [-87.63, 41.88]},
                              "properties": {"name": "Chicago", "state": "Illinois", "country": "United States"}}]}
    raise AssertionError(url)


@override_settings(REST_FRAMEWORK={
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": [],
    "EXCEPTION_HANDLER": "trips.exceptions.api_exception_handler",
})
class ApiTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        patchers = [
            mock.patch("trips.services.routing.get_json", side_effect=fake_get_json),
            mock.patch("trips.services.weather.get_json", side_effect=fake_get_json),
            mock.patch("trips.services.geocoding.get_json", side_effect=fake_get_json),
        ]
        for p in patchers:
            p.start()
            self.addCleanup(p.stop)

    def test_health(self):
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})

    def test_conditions_returns_rated_wind_for_hubs(self):
        res = self.client.get("/api/conditions/")
        self.assertEqual(res.status_code, 200, res.content)
        hubs = res.json()["hubs"]
        self.assertTrue(hubs)
        # the fake forecast is 12 mph everywhere -> Low
        self.assertEqual(hubs[0]["wind_mph"], 12.0)
        self.assertEqual(hubs[0]["level"], "low")

    def test_reverse_geocode_labels_a_gps_fix(self):
        feature = {"geometry": {"coordinates": [-87.63, 41.88]}, "properties": {"name": "Chicago", "state": "Illinois", "country": "United States"}}
        with mock.patch("trips.services.geocoding.get_json", return_value={"features": [feature]}):
            res = self.client.get("/api/reverse/", {"lat": 41.88, "lon": -87.63})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["label"], "Chicago, Illinois, United States")

    def test_reverse_geocode_falls_back_to_my_location(self):
        with mock.patch("trips.services.geocoding.get_json", return_value={"features": []}):
            res = self.client.get("/api/reverse/", {"lat": 10.5, "lon": 20.5})
        self.assertEqual(res.json()["label"], "My location")

    def test_plan_end_to_end(self):
        res = self.client.post("/api/plan/", payload(), format="json")
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertGreaterEqual(len(data["routes"]), 1)
        route = data["routes"][0]
        self.assertTrue(route["checkpoints"])
        # 0.5 mm/hr rain = 0.02 in/hr -> Low
        self.assertEqual(route["summary"]["max_level"], "low")
        self.assertIn(data["recommended_id"], {r["id"] for r in data["routes"]})
        self.assertIn("bounds", data)

    def test_heatmap(self):
        res = self.client.post(
            "/api/heatmap/",
            {"south": 39.7, "west": -87.7, "north": 41.9, "east": -86.1, "load_weight_lb": 0},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(len(data["levels"]), 49)
        self.assertEqual(len(data["levels"][0]), data["rows"] * data["cols"])

    def test_geocode(self):
        res = self.client.get("/api/geocode/", {"q": "Chicago"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["results"][0]["label"], "Chicago, Illinois, United States")

    def test_rejects_unknown_fields(self):
        res = self.client.post("/api/plan/", payload(admin=True), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("admin", res.json()["fields"])

    def test_rejects_out_of_range_inputs(self):
        cases = [
            payload(load_weight_lb=-5),
            payload(load_weight_lb=500000),
            payload(checkpoint_interval_miles=7),
            payload(departure_time=(timezone.now() - timedelta(hours=3)).isoformat()),
            payload(departure_time=(timezone.now() + timedelta(hours=60)).isoformat()),
            payload(departure_time="2026-01-01T10:00:00"),  # no time zone
            payload(origin={"lat": 95, "lon": 0}),
            payload(destination=ORIGIN),
            payload(destination={"lat": 34.05, "lon": -118.24}),  # > 1500 miles
        ]
        for body in cases:
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/api/plan/", body, format="json").status_code, 400)

    def test_rejects_non_json(self):
        res = self.client.post("/api/plan/", "origin=x", content_type="application/x-www-form-urlencoded")
        self.assertEqual(res.status_code, 415)

    def test_heatmap_rejects_huge_area(self):
        res = self.client.post("/api/heatmap/", {"south": 0, "west": -170, "north": 60, "east": 170}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_upstream_failure_returns_safe_message(self):
        with mock.patch("trips.views.plan_trip", side_effect=UpstreamError("The routing service is unreachable. Please try again.")):
            res = self.client.post("/api/plan/", payload(), format="json")
        self.assertEqual(res.status_code, 502)
        self.assertEqual(res.json(), {"error": "The routing service is unreachable. Please try again."})

    def test_unexpected_error_hides_details(self):
        with mock.patch("trips.views.plan_trip", side_effect=RuntimeError("secret internals")):
            res = self.client.post("/api/plan/", payload(), format="json")
        self.assertEqual(res.status_code, 500)
        self.assertNotIn("secret", res.content.decode())

    def test_geocode_query_validation(self):
        self.assertEqual(self.client.get("/api/geocode/", {"q": "a"}).status_code, 400)
        self.assertEqual(self.client.get("/api/geocode/", {"q": "x" * 200}).status_code, 400)


class GeocodeDedupeTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_duplicate_labels_removed(self):
        feature = {"geometry": {"coordinates": [-96.8, 32.78]},
                   "properties": {"name": "Dallas", "state": "Texas", "country": "United States"}}
        other = {"geometry": {"coordinates": [-94.0, 41.67]},
                 "properties": {"name": "Dallas", "state": "Iowa", "country": "United States"}}
        with mock.patch("trips.services.geocoding.get_json", return_value={"features": [feature, feature, other]}):
            from trips.services.geocoding import search_places
            labels = [r["label"] for r in search_places("Dallas")]
        self.assertEqual(labels, ["Dallas, Texas, United States", "Dallas, Iowa, United States"])


class TimezoneTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_returns_iana_name_and_falls_back(self):
        from trips.services.weather import get_timezone
        with mock.patch("trips.services.weather.get_json", return_value={"timezone": "America/Chicago"}):
            self.assertEqual(get_timezone((-96.8, 32.78)), "America/Chicago")
        cache.clear()
        with mock.patch("trips.services.weather.get_json", side_effect=UpstreamError("down")):
            self.assertIsNone(get_timezone((-96.8, 32.78)))

