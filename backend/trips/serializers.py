"""Strict input validation. Anything not described here is rejected."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .services.geo import haversine_miles

MAX_TRIP_MILES = 1500  # straight-line; keeps requests within free API limits
MIN_TRIP_MILES = 1
MAX_LOAD_LB = 80_000  # US federal gross weight limit without special permits
MAX_DEPARTURE_AHEAD = timedelta(hours=48)
DEPARTURE_GRACE = timedelta(minutes=30)
INTERVAL_CHOICES = (10, 25, 50)


class StrictSerializer(serializers.Serializer):
    """Rejects unknown fields instead of silently ignoring them."""

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError({"non_field_errors": ["Expected a JSON object."]})
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: ["Unknown field."] for key in sorted(unknown)})
        return super().to_internal_value(data)


class PlaceSerializer(StrictSerializer):
    lat = serializers.FloatField(min_value=-85, max_value=85)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True, trim_whitespace=True)


class PlanRequestSerializer(StrictSerializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LB)
    checkpoint_interval_miles = serializers.ChoiceField(choices=INTERVAL_CHOICES, default=25)

    def validate_departure_time(self, value):
        if timezone.is_naive(value):
            raise serializers.ValidationError("Include a time zone (ISO 8601, e.g. 2026-11-02T08:00:00Z).")
        now = timezone.now()
        if value < now - DEPARTURE_GRACE:
            raise serializers.ValidationError("Departure time cannot be in the past.")
        if value > now + MAX_DEPARTURE_AHEAD:
            raise serializers.ValidationError("Departure must be within the next 48 hours (forecast range).")
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        miles = haversine_miles((o["lon"], o["lat"]), (d["lon"], d["lat"]))
        if miles < MIN_TRIP_MILES:
            raise serializers.ValidationError({"destination": ["Destination must be at least 1 mile from the origin."]})
        if miles > MAX_TRIP_MILES:
            raise serializers.ValidationError(
                {"destination": [f"Trips are limited to {MAX_TRIP_MILES} miles in a straight line."]}
            )
        return attrs


class HeatmapRequestSerializer(StrictSerializer):
    south = serializers.FloatField(min_value=-85, max_value=85)
    west = serializers.FloatField(min_value=-180, max_value=180)
    north = serializers.FloatField(min_value=-85, max_value=85)
    east = serializers.FloatField(min_value=-180, max_value=180)
    load_weight_lb = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LB, default=0)
    # Up to three route lines, each a list of [lat, lon] pairs, that the heatmap band follows.
    corridor = serializers.ListField(
        child=serializers.ListField(
            child=serializers.ListField(child=serializers.FloatField(min_value=-180, max_value=180), min_length=2, max_length=2),
            min_length=2,
            max_length=1500,
        ),
        max_length=3,
        required=False,
    )

    def validate(self, attrs):
        if attrs["north"] <= attrs["south"] or attrs["east"] <= attrs["west"]:
            raise serializers.ValidationError({"non_field_errors": ["Invalid bounding box."]})
        if attrs["north"] - attrs["south"] > 30 or attrs["east"] - attrs["west"] > 40:
            raise serializers.ValidationError({"non_field_errors": ["Area is too large."]})
        return attrs


class GeocodeQuerySerializer(StrictSerializer):
    q = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)


class TimezoneQuerySerializer(StrictSerializer):
    lat = serializers.FloatField(min_value=-85, max_value=85)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class ReverseQuerySerializer(StrictSerializer):
    lat = serializers.FloatField(min_value=-85, max_value=85)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class ReverseQuerySerializer(StrictSerializer):
    lat = serializers.FloatField(min_value=-85, max_value=85)
    lon = serializers.FloatField(min_value=-180, max_value=180)
