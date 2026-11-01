"""Proof tests for the risk logic (mocked weather), the dev-only storm, the corridor heatmap and the route fallback."""
from unittest import mock

from django.test import SimpleTestCase, override_settings

from trips.services import heatmap, routing, scenario
from trips.services.geo import build_polyline, haversine_miles
from trips.services.heatmap import build_heatmap, corridor_weight
from trips.services.planner import build_plan, place_checkpoints, shortfall_notice
from trips.services.routing import RouteOption, get_route_options
from trips.services.weather import point_key
from trips.tests.test_planner import DEPART, forecast, straight_line


def plan_for(polys, forecasts_by_route, load):
    forecasts = {}
    for poly, f in zip(polys, forecasts_by_route):
        for cp in place_checkpoints(poly, 25):
            forecasts[point_key(cp.point)] = f
    return build_plan([RouteOption(p, "fastest" if i == 0 else "alternative") for i, p in enumerate(polys)], DEPART, load, 25, forecasts)


class RecommendationProofTests(SimpleTestCase):
    """a) A storm on the fastest route moves the recommendation to a slower, calmer one."""

    def setUp(self):
        self.fast = straight_line(100, 1.5, lon=-100.0)
        self.slower = straight_line(115, 2.2, lon=-99.0)
        self.slowest = straight_line(130, 2.8, lon=-98.0)

    def test_calm_weather_recommends_the_fastest(self):
        plan = plan_for([self.fast, self.slower, self.slowest], [forecast(5), forecast(5), forecast(5)], 15_000)
        self.assertEqual(plan["recommended_id"], "a")

    def test_storm_on_the_fastest_switches_to_a_slower_calmer_route(self):
        plan = plan_for([self.fast, self.slower, self.slowest], [forecast(40), forecast(5), forecast(5)], 15_000)
        self.assertEqual(plan["recommended_id"], "b")
        by_id = {r["id"]: r for r in plan["routes"]}
        self.assertGreater(by_id["b"]["duration_seconds"], by_id["a"]["duration_seconds"])
        self.assertEqual(by_id["a"]["rank"], 3)

    def test_reason_names_the_criterion_that_decided_it(self):
        plan = plan_for([self.fast, self.slower], [forecast(40), forecast(5)], 15_000)
        reason = plan["recommendation"]["reason"]
        self.assertEqual(plan["recommended_id"], "b")
        self.assertIn("fewest High-risk miles", reason)
        self.assertIn("Route A", reason)
        self.assertIn("0 vs", reason)
        self.assertIn("slower than the fastest route (Route A)", reason)
        self.assertIn("25 mi of High-risk weather".replace("25", "%g" % plan["routes"][0]["summary"]["high_miles"]), reason)


class LoadRuleProofTests(SimpleTestCase):
    """b) About 40 mph wind is High at 15,000 lb and Severe at 45,000 lb on the same route."""

    def route_summary(self, wind, load):
        plan = plan_for([straight_line(100, 1.5)], [forecast(wind)], load)
        return plan["routes"][0]

    def test_40_mph_is_high_for_a_light_load(self):
        route = self.route_summary(40, 15_000)
        self.assertEqual(route["summary"]["max_level"], "high")
        self.assertEqual(route["summary"]["severe_miles"], 0)

    def test_40_mph_is_severe_for_a_heavy_load(self):
        route = self.route_summary(40, 45_000)
        self.assertEqual(route["summary"]["max_level"], "severe")
        self.assertGreater(route["summary"]["severe_miles"], 0)
        self.assertIn("lb load", " ".join(route["checkpoints"][0]["reasons"]))

    def test_the_threshold_is_strictly_above_40000(self):
        self.assertEqual(self.route_summary(40, 40_000)["summary"]["max_level"], "high")
        self.assertEqual(self.route_summary(40, 40_001)["summary"]["max_level"], "severe")


class NoTravelProofTests(SimpleTestCase):
    """c) No Travel conditions, ranking last, and the all-routes-blocked warning."""

    def level(self, wind, load):
        return plan_for([straight_line(100, 1.5)], [forecast(wind)], load)["routes"][0]["summary"]["max_level"]

    def test_wind_55_or_more_is_no_travel_at_any_weight(self):
        self.assertEqual(self.level(55, 0), "no_travel")
        self.assertEqual(self.level(70, 10_000), "no_travel")

    def test_wind_45_to_54_is_no_travel_only_above_30000_lb(self):
        self.assertEqual(self.level(50, 30_000), "severe")
        self.assertEqual(self.level(50, 30_001), "no_travel")
        self.assertEqual(self.level(45, 45_000), "no_travel")

    def test_a_no_travel_route_ranks_last_even_if_it_is_the_fastest(self):
        polys = [straight_line(100, 1.5, -100.0), straight_line(110, 2.0, -99.0), straight_line(120, 2.5, -98.0)]
        plan = plan_for(polys, [forecast(60), forecast(5), forecast(5)], 0)
        ranks = {r["id"]: r["rank"] for r in plan["routes"]}
        self.assertEqual(ranks["a"], 3)
        self.assertIsNone(plan["recommendation"]["warning"])

    def test_warning_appears_only_when_every_route_is_blocked(self):
        polys = [straight_line(100, 1.5, -100.0), straight_line(110, 2.0, -99.0), straight_line(120, 2.5, -98.0)]
        some = plan_for(polys, [forecast(60), forecast(60), forecast(5)], 45_000)
        self.assertIsNone(some["recommendation"]["warning"])
        every = plan_for(polys, [forecast(60), forecast(50), forecast(46)], 45_000)
        self.assertIsNotNone(every["recommendation"]["warning"])
        self.assertIn("No Travel", every["recommendation"]["warning"])


class StormScenarioTests(SimpleTestCase):
    """d) The dev-only storm: strongest at its centre, moves smoothly, and can never run in production."""

    def setUp(self):
        self.route = straight_line(200, 3.5)
        self.storm = scenario.storm_for(self.route, now=DEPART)

    def test_cannot_be_enabled_outside_debug(self):
        with override_settings(DEBUG=False, WEATHER_SCENARIO="storm"):
            self.assertFalse(scenario.enabled())
        with override_settings(DEBUG=True, WEATHER_SCENARIO=""):
            self.assertFalse(scenario.enabled())
        with override_settings(DEBUG=True, WEATHER_SCENARIO="storm"):
            self.assertTrue(scenario.enabled())

    def test_settings_ignore_the_variable_when_debug_is_off(self):
        import importlib
        import os

        from config import settings as settings_module

        keys = {"DJANGO_DEBUG": "0", "WEATHER_SCENARIO": "storm", "DJANGO_SECRET_KEY": "x" * 50}
        with mock.patch.dict(os.environ, keys):
            reloaded = importlib.reload(settings_module)
            self.assertEqual(reloaded.WEATHER_SCENARIO, "")
        importlib.reload(settings_module)  # restore the real settings module

    def test_wind_peaks_at_the_centre_and_fades_with_distance(self):
        centre = self.storm.center(0)
        far = (centre[0] + 3.0, centre[1])  # ~160 miles away
        out = scenario.apply({point_key(centre): forecast(5), point_key(far): forecast(5)}, self.storm)
        near_wind = out[point_key(centre)].wind_mph[0]
        far_wind = out[point_key(far)].wind_mph[0]
        self.assertAlmostEqual(near_wind, 5 + self.storm.peak_mph, delta=1.5)
        self.assertLess(far_wind, 6)

    def test_real_forecasts_are_not_modified(self):
        original = forecast(5)
        key = point_key(self.storm.center(0))
        scenario.apply({key: original}, self.storm)
        self.assertEqual(original.wind_mph[0], 5)

    def test_storm_moves_along_the_route_over_48_hours(self):
        start, end = self.storm.center(0), self.storm.center(48)
        self.assertGreater(haversine_miles(start, end), 0.5 * self.route.total_miles)
        # A point near the end of the route is hit harder at hour 48 than at hour 0.
        late = self.storm.center(48)
        self.assertGreater(self.storm.strength(late, 48), 5 * self.storm.strength(late, 0))

    def test_motion_is_smooth_hour_to_hour(self):
        point = self.route.locate(self.route.total_miles * 0.5)[0]
        out = scenario.apply({point_key(point): forecast(5)}, self.storm)[point_key(point)]
        steps = [abs(out.wind_mph[h + 1] - out.wind_mph[h]) for h in range(48)]
        self.assertLess(max(steps), 0.25 * self.storm.peak_mph)
        self.assertGreater(max(out.wind_mph[:49]), 5 + 0.8 * self.storm.peak_mph)  # it does pass over


class CorridorHeatmapTests(SimpleTestCase):
    LINE = [[35.0 + i * 0.03, -100.0] for i in range(51)]  # north-south, about 100 miles

    def test_weight_is_full_near_the_route_and_zero_far_away(self):
        near = corridor_weight(35.5, -100.0 + 0.2, [self.LINE])  # ~11 miles off
        mid = corridor_weight(35.5, -100.0 + 0.5, [self.LINE])  # ~28 miles off
        far = corridor_weight(35.5, -100.0 + 1.5, [self.LINE])  # ~85 miles off
        self.assertEqual(near, 1.0)
        self.assertTrue(0.0 < mid < 1.0)
        self.assertEqual(far, 0.0)

    def test_only_the_band_is_fetched_and_the_rest_is_empty(self):
        requested = []

        def fake_forecasts(points):
            requested.extend(points)
            return {point_key(p): forecast(5) for p in points}

        with mock.patch.object(heatmap, "get_forecasts", side_effect=fake_forecasts):
            result = build_heatmap(35.0, -100.5, 36.5, -99.5, 15_000, corridor=[self.LINE])
        cells = result["rows"] * result["cols"]
        self.assertEqual(len(result["mask"]), cells)
        self.assertLess(len(requested), cells)  # cells outside the band cost no weather calls
        self.assertIn(0.0, result["mask"])
        self.assertIn(1.0, result["mask"])
        for i, weight in enumerate(result["mask"]):
            if weight == 0.0:
                self.assertTrue(all(hour[i] == -1 for hour in result["levels"]))
        self.assertEqual(len(result["levels"]), 49)

    def test_without_a_corridor_the_whole_rectangle_is_kept(self):
        with mock.patch.object(heatmap, "get_forecasts", side_effect=lambda pts: {point_key(p): forecast(5) for p in pts}):
            result = build_heatmap(35.0, -100.5, 36.5, -99.5, 0)
        self.assertEqual(set(result["mask"]), {1.0})


def osrm_line(lon, n=40):
    coords = [[lon, 35.0 + i * 0.03] for i in range(n)]
    return {"geometry": {"coordinates": coords}, "duration": 5400, "distance": 130_000, "legs": []}


class RouteFallbackTests(SimpleTestCase):
    def test_via_points_fill_in_when_the_service_returns_one_route(self):
        def fake(points, alternatives):
            return [osrm_line(-100.0)] if len(points) == 2 else [osrm_line(points[1][0])]

        with mock.patch.object(routing, "_osrm", side_effect=fake):
            options = get_route_options((-100.0, 35.0), (-100.0, 36.17))
        self.assertEqual(len(options), 3)
        self.assertEqual([o.source for o in options], ["fastest", "via", "via"])

    def test_returns_fewer_when_no_distinct_route_exists(self):
        with mock.patch.object(routing, "_osrm", return_value=[osrm_line(-100.0)]):
            options = get_route_options((-100.0, 35.0), (-100.0, 36.17))
        self.assertEqual(len(options), 1)

    def test_shortfall_note(self):
        self.assertIsNone(shortfall_notice(3))
        self.assertIn("only 2 distinct routes", shortfall_notice(2))
        self.assertIn("only one drivable route", shortfall_notice(1))
        self.assertIn("60%", shortfall_notice(2))
