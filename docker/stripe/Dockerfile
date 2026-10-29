FROM python:3.12-slim-bookworm

WORKDIR /opt/dash
COPY server.py healthcheck.py ./

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    DASH_STRIPE_PORT=12119 \
    DASH_STRIPE_KEY=sk_test_dash

EXPOSE 12119
USER nobody

CMD ["python", "/opt/dash/server.py"]
