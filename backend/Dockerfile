# Container image for the Django API (built and run by Render; also runs on Cloud Run).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user.
RUN useradd --system --uid 10001 --no-create-home app && chown -R app /app
USER app

# The host (Render, Cloud Run) supplies $PORT; 8080 is the fallback.
ENV PORT=8080
EXPOSE 8080

CMD exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT} \
    --workers 2 --threads 4 --timeout 60 \
    --access-logfile - --error-logfile -
