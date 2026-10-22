-- Fixture warehouse for @dash/adapter-postgres.
-- Loaded once, when the cluster data directory is created.

CREATE TABLE public.orders (
  id integer PRIMARY KEY,
  total integer NOT NULL,
  status text NOT NULL,
  region text,
  note text
);

INSERT INTO public.orders (id, total, status, region, note) VALUES
  (1, 10, 'paid', 'Europe', 'first'),
  (2, 25, 'paid', 'Europe', NULL),
  (3, 5, 'open', 'Asia Pacific', 'third'),
  (4, 40, 'paid', 'North America', NULL);

CREATE TABLE public.revenue (
  month text PRIMARY KEY,
  amount integer NOT NULL
);

INSERT INTO public.revenue (month, amount) VALUES
  ('2026-01', 10),
  ('2026-02', 20),
  ('2026-03', 15);

CREATE VIEW public.paid_orders AS
SELECT id, total, status, region
FROM public.orders
WHERE status = 'paid';
