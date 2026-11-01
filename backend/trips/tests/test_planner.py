from django.test import SimpleTestCase

from trips.services.geo import build_polyline, haversine_miles, offset_midpoint
from trips.services.planner import build_plan, coverage, explain, place_checkpoints, rank_key
from trips.services.routing import RouteOption
from trips.services.weather import HourlyForecast, point_key

DEPART = 1_800_000_000 - (1_800_000_000 % 3600)  # on the hour


def straight_line(miles: float, hours: float, lon: float = -100.0, n: int = 50):
    """A north-south line of ``miles`` length driven in ``hours``. Lines at
    different longitudes have identical lengths, so only weather/time differ."""
    deg = miles / 69.0933  # miles per degree of latitude
    coords = [(lon, 35.0 + deg * i / (n - 1)) for i in range(n)]
    return build_polyline(coords, None, hours * 3600)


def forecast(wind=5.0, rain=0.0, snow=0.0, hours=96):
    times = tuple(DEPART + h * 3600 for h in range(hours))
    return HourlyForecast(times, (wind,) * hours, (wind + 5,) * hours, (rain,) * hours, (snow,) * hours)


class GeometryTests(SimpleTestCase):
    def test_haversine_known_distance(self):
        # One degree of latitude is about 69 miles.
        self.assertAlmostEqual(haversine_miles((0, 0), (0, 1)), 69.09, delta=0.1)

    def test_locate_interpolates_time(self):
        poly = straight_line(100, 2)
        _, seconds = poly.locate(poly.total_miles / 2)
        self.assertAlmostEqual(seconds, 3600, delta=1)

    def test_offset_midpoint_moves_sideways(self):
        a, b = (-100.0, -100.0), (-98.0, -100.0)
        via = offset_midpoint(a, b, 0.2)
        self.assertAlmostEqual(via[0], -99.0, places=3)
        self.assertGreater(via[1], -100.0)


class CheckpointTests(SimpleTestCase):
    def test_checkpoints_every_interval_plus_ends(self):
        poly = straight_line(120, 2)
        cps = place_checkpoints(poly, 25)
        miles = [round(c.mile) for c in cps]
        self.assertEqual(miles[:5], [0, 25, 50, 75, 100])
        self.assertAlmostEqual(cps[-1].mile, poly.total_miles, places=6)

    def test_eta_grows_along_route(self):
        cps = place_checkpoints(straight_line(200, 4), 50)
        seconds = [c.elapsed_seconds for c in cps]
        self.assertEqual(seconds, sorted(seconds))
        self.assertAlmostEqual(seconds[-1], 4 * 3600, delta=1)

    def test_coverage_sums_to_total(self):
        marks = [0, 25, 50, 75, 100, 112]
        spans = coverage(marks, 112)
        self.assertAlmostEqual(sum(spans), 112)
        self.assertEqual(spans[0], 12.5)

    def test_rejects_bad_interval(self):
        with self.assertRaises(ValueError):
            place_checkpoints(straight_line(50, 1), 0)


class ForecastTimingTests(SimpleTestCase):
    def test_uses_hour_nearest_eta(self):
        f = forecast(hours=10)
        self.assertEqual(f.index_for(DEPART + 3 * 3600 + 1000), 3)
        self.assertEqual(f.index_for(DEPART + 3 * 3600 + 2000), 4)
        self.assertIsNone(f.index_for(DEPART + 20 * 3600))


def option(poly, source="fastest"):
    return RouteOption(poly, source)


class PlanTests(SimpleTestCase):
    def _plan(self, polys, forecasts_by_route, load=10_000, interval=25):
        forecasts = {}
        for poly, f in zip(polys, forecasts_by_route):
            for cp in place_checkpoints(poly, interval):
                forecasts[point_key(cp.point)] = f
        return build_plan([option(p) for p in polys], DEPART, load, interval, forecasts)

    def test_prefers_fewer_severe_miles_over_speed(self):
        fast_stormy = straight_line(100, 1.5, lon=-100.0)
        slow_calm = straight_line(130, 2.5, lon=-99.0)
        medium = straight_line(110, 2.0, lon=-98.0)
        plan = self._plan(
            [fast_stormy, slow_calm, medium],
            [forecast(wind=48), forecast(wind=5), forecast(wind=38)],
        )
        self.assertEqual(plan["recommended_id"], "b")
        ranks = {r["id"]: r["rank"] for r in plan["routes"]}
        self.assertEqual(ranks, {"b": 1, "c": 2, "a": 3})  # the fast but Severe route is last

    def test_severe_miles_beat_high_miles(self):
        severe = straight_line(100, 1.5, lon=-100.0)
        high = straight_line(100, 2.5, lon=-99.0)
        plan = self._plan([severe, high], [forecast(wind=48), forecast(wind=38)])
        self.assertEqual(plan["recommended_id"], "b")
        self.assertIn("Severe", plan["recommendation"]["reason"])

    def test_falls_back_to_travel_time_when_risk_equal(self):
        polys = [straight_line(120, 2.5, -100.0), straight_line(100, 2.0, -99.0), straight_line(110, 2.2, -98.0)]
        plan = self._plan(polys, [forecast(), forecast(), forecast()])
        self.assertEqual(plan["recommended_id"], "b")
        self.assertIn("faster", plan["recommendation"]["reason"])

    def test_load_rule_changes_recommendation(self):
        # 40 mph wind is High for a light truck but Severe above 40,000 lb.
        windy_fast = straight_line(100, 1.5, -100.0)
        rainy_slow = straight_line(100, 2.5, -99.0)
        light = self._plan([windy_fast, rainy_slow], [forecast(wind=40), forecast(rain=0.3)], load=20_000)
        heavy = self._plan([windy_fast, rainy_slow], [forecast(wind=40), forecast(rain=0.3)], load=45_000)
        self.assertEqual(light["recommended_id"], "a")
        self.assertEqual(heavy["recommended_id"], "b")

    def test_no_travel_route_ranked_last_and_warning_when_all_blocked(self):
        polys = [straight_line(100, 1.5, -100.0), straight_line(100, 2.0, -99.0)]
        plan = self._plan(polys, [forecast(wind=60), forecast(wind=50)], load=0)
        self.assertEqual(plan["recommended_id"], "b")
        self.assertIsNone(plan["recommendation"]["warning"])

        blocked = self._plan(polys, [forecast(wind=60), forecast(wind=60)], load=0)
        self.assertIsNotNone(blocked["recommendation"]["warning"])

    def test_summary_miles_add_up(self):
        poly = straight_line(137, 2.5)
        plan = self._plan([poly], [forecast(rain=0.15)])
        route = plan["routes"][0]
        total = sum(route["summary"]["miles_by_level"].values())
        self.assertAlmostEqual(total, route["distance_miles"], delta=0.2)
        self.assertEqual(route["summary"]["max_level"], "moderate")
        self.assertEqual(route["summary"]["average_risk"], 1.0)

    def test_checkpoints_outside_forecast_are_unknown(self):
        poly = straight_line(400, 8)
        short = forecast(hours=3)
        plan = self._plan([poly], [short])
        levels = {c["level"] for c in plan["routes"][0]["checkpoints"]}
        self.assertIn("unknown", levels)
        self.assertGreater(plan["routes"][0]["summary"]["unknown_miles"], 0)

    def test_rank_key_order(self):
        a = {"summary": {"no_travel_miles": 0, "severe_miles": 0, "high_miles": 5, "average_risk": 1}, "duration_seconds": 100}
        b = {"summary": {"no_travel_miles": 0, "severe_miles": 0, "high_miles": 1, "average_risk": 2}, "duration_seconds": 900}
        self.assertLess(rank_key(b), rank_key(a))

    def test_explain_single_route(self):
        best = {"name": "A", "summary": {}, "duration_seconds": 1}
        self.assertIn("only route", explain(best, None))



class StepParsingTests(SimpleTestCase):
    def test_steps_are_extracted_in_miles(self):
        from trips.services.routing import _steps

        raw = {
            "legs": [
                {
                    "steps": [
                        {"maneuver": {"type": "depart", "location": [-87.63, 41.88]}, "name": "Wacker Dr", "distance": 1609.344, "duration": 120},
                        {"maneuver": {"type": "turn", "modifier": "right", "location": [-87.62, 41.87]}, "name": "I-65 S", "ref": "I 65", "distance": 3218.688, "duration": 200},
                        {"maneuver": {"type": "arrive"}, "name": "", "distance": 0, "duration": 0},
                    ]
                }
            ]
        }
        steps = _steps(raw)
        self.assertEqual(len(steps), 2)  # a step without a location is skipped
        self.assertEqual(steps[0]["distance_miles"], 1.0)
        self.assertEqual(steps[1]["modifier"], "right")
        self.assertEqual(steps[1]["ref"], "I 65")
        self.assertEqual(steps[1]["lat"], 41.87)
