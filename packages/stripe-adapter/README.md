# Stripe adapter

`@dash/adapter-stripe` implements `DataAdapter` for the Stripe REST API.

Structured queries read `customers`, `charges`, `invoices`, and `subscriptions`. Filters Stripe Search can express are sent as a search query. Sorts other than newest-first, and filters Search cannot express, read the full match set before a page is returned. A query that is still incomplete after 10,000 rows fails instead of returning a partial page. The secret key is sent as a bearer token and is omitted from `stripePublicSummary`. A restricted key's summary says whether it is live or test. Introspection lists only the objects the key can read.

Cloud calls use `https://api.stripe.com`. `http` is accepted only for a loopback fixture. Redirects are not followed. The local fixture is the `stripe` service in `docker-compose.test.yml` at `http://127.0.0.1:12119`.
