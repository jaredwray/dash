-- Fixture for the local Redshift stand-in.
-- Amazon Redshift has no official local image. This cluster speaks the
-- PostgreSQL wire protocol and loads the same analytics rows as the other
-- warehouse adapters. Loaded once, when the cluster data directory is created.

CREATE TABLE public.orders (
  id integer PRIMARY KEY,
  total integer NOT NULL,
  status varchar(32) NOT NULL,
  region varchar(64),
  note varchar(64)
);

INSERT INTO public.orders (id, total, status, region, note) VALUES
  (1, 10, 'paid', 'Europe', 'first'),
  (2, 25, 'paid', 'Europe', NULL),
  (3, 5, 'open', 'Asia Pacific', 'third'),
  (4, 40, 'paid', 'North America', NULL);

CREATE TABLE public.revenue (
  month varchar(16) PRIMARY KEY,
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
