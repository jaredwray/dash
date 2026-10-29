import json
import os
import urllib.request

port = os.environ.get("DASH_STRIPE_PORT", "12119")
key = os.environ.get("DASH_STRIPE_KEY", "sk_test_dash")
request = urllib.request.Request(
    f"http://127.0.0.1:{port}/v1/customers?limit=1&email=ada@example.com",
    headers={"Authorization": f"Bearer {key}"},
)
with urllib.request.urlopen(request, timeout=3) as response:
    if response.status != 200:
        raise SystemExit(1)
    body = json.load(response)
ids = [row.get("id") for row in body.get("data", [])]
if ids != ["cus_ada"]:
    raise SystemExit(1)
