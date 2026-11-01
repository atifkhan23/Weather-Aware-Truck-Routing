"""Consistent JSON errors that never expose stack traces or upstream internals."""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .services.http import UpstreamError

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    if isinstance(exc, UpstreamError):
        return Response({"error": str(exc)}, status=exc.status)

    response = exception_handler(exc, context)
    if response is not None:
        if response.status_code == status.HTTP_400_BAD_REQUEST:
            response.data = {"error": "Please check the highlighted fields.", "fields": response.data}
        elif isinstance(response.data, dict) and "detail" in response.data:
            response.data = {"error": str(response.data["detail"])}
        return response

    logger.exception("Unhandled API error", exc_info=exc)
    return Response(
        {"error": "Something went wrong on our side. Please try again."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
