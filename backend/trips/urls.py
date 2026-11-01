from django.urls import path

from .views import ConditionsView, GeocodeView, HealthView, HeatmapView, PlanView, ReverseView, TimezoneView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("geocode/", GeocodeView.as_view(), name="geocode"),
    path("reverse/", ReverseView.as_view(), name="reverse"),
    path("conditions/", ConditionsView.as_view(), name="conditions"),
    path("timezone/", TimezoneView.as_view(), name="timezone"),
    path("plan/", PlanView.as_view(), name="plan"),
    path("heatmap/", HeatmapView.as_view(), name="heatmap"),
]
