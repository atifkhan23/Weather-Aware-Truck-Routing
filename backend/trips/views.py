from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    GeocodeQuerySerializer,
    HeatmapRequestSerializer,
    PlanRequestSerializer,
    ReverseQuerySerializer,
    TimezoneQuerySerializer,
)
from .services.conditions import current_conditions
from .services.geocoding import reverse_place, search_places
from .services.heatmap import build_heatmap
from .services.planner import plan_trip
from .services.weather import get_timezone


class HealthView(APIView):
    throttle_classes: list = []

    def get(self, request):
        return Response({"status": "ok"})


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        query = GeocodeQuerySerializer(data=request.query_params.dict())
        query.is_valid(raise_exception=True)
        return Response({"results": search_places(query.validated_data["q"])})


class ReverseView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        query = ReverseQuerySerializer(data=request.query_params.dict())
        query.is_valid(raise_exception=True)
        d = query.validated_data
        place = reverse_place(d["lat"], d["lon"]) or {"label": "My location", "lat": d["lat"], "lon": d["lon"]}
        return Response(place)


class ConditionsView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        return Response({"hubs": current_conditions()})


class TimezoneView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        query = TimezoneQuerySerializer(data=request.query_params.dict())
        query.is_valid(raise_exception=True)
        d = query.validated_data
        return Response({"timezone": get_timezone((d["lon"], d["lat"])) or "UTC"})


class PlanView(APIView):
    throttle_scope = "plan"

    def post(self, request):
        body = PlanRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        plan = plan_trip(
            origin=(data["origin"]["lon"], data["origin"]["lat"]),
            destination=(data["destination"]["lon"], data["destination"]["lat"]),
            departure_unix=data["departure_time"].timestamp(),
            load_lb=data["load_weight_lb"],
            interval_miles=float(data["checkpoint_interval_miles"]),
        )
        return Response(plan)


class HeatmapView(APIView):
    throttle_scope = "heatmap"

    def post(self, request):
        body = HeatmapRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        return Response(
            build_heatmap(d["south"], d["west"], d["north"], d["east"], load_lb=d["load_weight_lb"], corridor=d.get("corridor"))
        )
