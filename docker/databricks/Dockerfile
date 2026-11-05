FROM python:3.12.16-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337

RUN pip install --no-cache-dir --disable-pip-version-check "duckdb==2.0.0"

WORKDIR /opt/dash
COPY server.py healthcheck.py ./

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    DASH_DATABRICKS_PORT=14439 \
    DASH_DATABRICKS_TOKEN=dash \
    DASH_DATABRICKS_WAREHOUSE=dash \
    DASH_DATABRICKS_CATALOG=dash \
    DASH_DATABRICKS_SCHEMA=analytics

EXPOSE 14439
USER nobody

CMD ["python", "/opt/dash/server.py"]
