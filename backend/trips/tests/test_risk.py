from django.test import SimpleTestCase

from trips.services.risk import Risk, assess, load_risk, rain_risk, risk_score, snow_risk, wind_risk


class WindRuleTests(SimpleTestCase):
    def test_bands(self):
        cases = [(0, Risk.LOW), (24.9, Risk.LOW), (25, Risk.MODERATE), (34, Risk.MODERATE),
                 (35, Risk.HIGH), (44, Risk.HIGH), (45, Risk.SEVERE), (54, Risk.SEVERE),
                 (55, Risk.NO_TRAVEL), (80, Risk.NO_TRAVEL)]
        for mph, expected in cases:
            with self.subTest(mph=mph):
                self.assertEqual(wind_risk(mph), expected)


class RainRuleTests(SimpleTestCase):
    def test_bands_with_cautious_boundaries(self):
        cases = [(0, Risk.LOW), (0.099, Risk.LOW), (0.10, Risk.MODERATE), (0.249, Risk.MODERATE),
                 (0.25, Risk.HIGH), (0.49, Risk.HIGH), (0.50, Risk.SEVERE), (1.00, Risk.SEVERE),
                 (1.01, Risk.NO_TRAVEL)]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(rain_risk(value), expected)


class SnowRuleTests(SimpleTestCase):
    def test_bands_with_cautious_boundaries(self):
        cases = [(0, Risk.LOW), (0.49, Risk.LOW), (0.5, Risk.MODERATE), (0.99, Risk.MODERATE),
                 (1.0, Risk.HIGH), (1.99, Risk.HIGH), (2.0, Risk.SEVERE), (3.0, Risk.SEVERE),
                 (3.01, Risk.NO_TRAVEL)]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(snow_risk(value), expected)


class LoadRuleTests(SimpleTestCase):
    def test_strong_wind_blocks_any_load(self):
        self.assertEqual(load_risk(55, 0), Risk.NO_TRAVEL)

    def test_severe_wind_with_heavy_load_is_no_travel(self):
        self.assertEqual(load_risk(45, 30_001), Risk.NO_TRAVEL)
        self.assertEqual(load_risk(54, 45_000), Risk.NO_TRAVEL)
        self.assertEqual(load_risk(50, 30_000), Risk.LOW)  # not "> 30,000"

    def test_high_wind_with_very_heavy_load_is_severe(self):
        self.assertEqual(load_risk(35, 40_001), Risk.SEVERE)
        self.assertEqual(load_risk(44, 79_000), Risk.SEVERE)
        self.assertEqual(load_risk(40, 40_000), Risk.LOW)

    def test_light_wind_never_adds_risk(self):
        self.assertEqual(load_risk(20, 80_000), Risk.LOW)


class AssessTests(SimpleTestCase):
    def test_worst_condition_wins(self):
        a = assess(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0.6, load_lb=10_000)
        self.assertEqual(a.level, Risk.HIGH)
        self.assertEqual(a.rain, Risk.HIGH)
        self.assertEqual(a.snow, Risk.MODERATE)
        self.assertIn("Rain 0.30 in/hr", a.reasons)

    def test_load_rule_raises_level(self):
        a = assess(wind_mph=40, rain_in_hr=0, snow_in_hr=0, load_lb=42_000)
        self.assertEqual(a.wind, Risk.HIGH)
        self.assertEqual(a.level, Risk.SEVERE)
        self.assertTrue(any("load" in r for r in a.reasons))

    def test_heavy_load_in_severe_wind_is_no_travel(self):
        self.assertEqual(assess(48, 0, 0, 35_000).level, Risk.NO_TRAVEL)
        self.assertEqual(assess(48, 0, 0, 20_000).level, Risk.SEVERE)

    def test_bad_inputs_are_treated_as_calm(self):
        self.assertEqual(assess(None, -1, None, 0).level, Risk.LOW)

    def test_score_agrees_with_discrete_level(self):
        for wind in range(0, 70, 3):
            for rain in (0, 0.05, 0.2, 0.4, 0.8, 1.2):
                for load in (0, 35_000, 45_000):
                    level = assess(wind, rain, 0, load).level
                    score = risk_score(wind, rain, 0, load)
                    self.assertEqual(int(score), int(level), (wind, rain, load))
