"""Weather risk and load rules from the assessment brief.

Thresholds (per checkpoint, worst condition wins):

    Condition  Low          Moderate    High       Severe     No Travel
    Wind       <25 mph      25-34       35-44      45-54      >=55 mph
    Rain       <0.10 in/hr  0.10-0.25   0.25-0.50  0.50-1.00  >1.00
    Snow       <0.5 in/hr   0.5-1.0     1.0-2.0    2.0-3.0    >3.0

Where two ranges share a boundary value (e.g. rain 0.25 in/hr), the value is
placed in the higher, more cautious level. Wind is in whole-mph style bands,
so 34.6 mph counts as Moderate and 35.0 mph as High.

Load rules (can only make a rating worse):
    wind >= 55 mph                    -> No Travel (any load)
    wind 45-54 mph and load > 30,000  -> No Travel
    wind 35-44 mph and load > 40,000  -> Severe
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return {
            Risk.LOW: "Low",
            Risk.MODERATE: "Moderate",
            Risk.HIGH: "High",
            Risk.SEVERE: "Severe",
            Risk.NO_TRAVEL: "No Travel",
        }[self]

    @property
    def key(self) -> str:
        return self.name.lower()


def wind_risk(mph: float) -> Risk:
    if mph < 25:
        return Risk.LOW
    if mph < 35:
        return Risk.MODERATE
    if mph < 45:
        return Risk.HIGH
    if mph < 55:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def rain_risk(in_per_hr: float) -> Risk:
    if in_per_hr < 0.10:
        return Risk.LOW
    if in_per_hr < 0.25:
        return Risk.MODERATE
    if in_per_hr < 0.50:
        return Risk.HIGH
    if in_per_hr <= 1.00:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def snow_risk(in_per_hr: float) -> Risk:
    if in_per_hr < 0.5:
        return Risk.LOW
    if in_per_hr < 1.0:
        return Risk.MODERATE
    if in_per_hr < 2.0:
        return Risk.HIGH
    if in_per_hr <= 3.0:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def load_risk(wind_mph: float, load_lb: float) -> Risk:
    """Extra risk caused by wind acting on the truck's load."""
    if wind_mph >= 55:
        return Risk.NO_TRAVEL
    if 45 <= wind_mph < 55 and load_lb > 30_000:
        return Risk.NO_TRAVEL
    if 35 <= wind_mph < 45 and load_lb > 40_000:
        return Risk.SEVERE
    return Risk.LOW


_BANDS = {
    "wind": (0.0, 25.0, 35.0, 45.0, 55.0, 70.0),
    "rain": (0.0, 0.10, 0.25, 0.50, 1.00, 1.50),
    "snow": (0.0, 0.5, 1.0, 2.0, 3.0, 4.0),
}


def _fraction(value: float, level: Risk, edges: tuple[float, ...]) -> float:
    lo, hi = edges[int(level)], edges[int(level) + 1]
    if hi <= lo:
        return 0.0
    return max(0.0, min(0.99, (value - lo) / (hi - lo)))


def risk_score(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> float:
    """Continuous risk in [0, 5): the integer part is the discrete Risk level, the
    fraction shows how far into that band the worst condition is. Used to draw a
    smooth heatmap that still agrees exactly with the discrete rules."""
    a = assess(wind_mph, rain_in_hr, snow_in_hr, load_lb)
    candidates = [float(a.load)]
    for name, value, level in (
        ("wind", wind_mph, a.wind),
        ("rain", rain_in_hr, a.rain),
        ("snow", snow_in_hr, a.snow),
    ):
        candidates.append(int(level) + _fraction(max(0.0, float(value or 0.0)), level, _BANDS[name]))
    return max(candidates)


@dataclass(frozen=True)
class Assessment:
    level: Risk
    wind: Risk
    rain: Risk
    snow: Risk
    load: Risk
    reasons: tuple[str, ...] = field(default_factory=tuple)


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    """Classify one point/time. Negative or missing inputs are treated as zero."""
    wind_mph = max(0.0, float(wind_mph or 0.0))
    rain_in_hr = max(0.0, float(rain_in_hr or 0.0))
    snow_in_hr = max(0.0, float(snow_in_hr or 0.0))

    w, r, s = wind_risk(wind_mph), rain_risk(rain_in_hr), snow_risk(snow_in_hr)
    l = load_risk(wind_mph, load_lb)
    level = max(w, r, s, l)

    reasons: list[str] = []
    if level > Risk.LOW:
        if w == level:
            reasons.append(f"Wind {wind_mph:.0f} mph")
        if r == level:
            reasons.append(f"Rain {rain_in_hr:.2f} in/hr")
        if s == level:
            reasons.append(f"Snow {snow_in_hr:.2f} in/hr")
        if l == level and l > w:
            reasons.append(f"Wind {wind_mph:.0f} mph with {load_lb:,.0f} lb load")
    return Assessment(level, w, r, s, l, tuple(reasons))
