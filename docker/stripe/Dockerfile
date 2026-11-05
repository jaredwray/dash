FROM python:3.12.16-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337

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
