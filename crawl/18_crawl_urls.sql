create table if not exists public.crawl_urls (
  id bigserial primary key,
  supplier_id text not null references public.supplier_profiles(supplier_id) on delete cascade,
  url text not null,
  kind text not null default 'unknown',
  source text,
  status text not null default 'pending',
  attempts int not null default 0,
  http_status int,
  page_type text,
  product_id uuid references public.products(id) on delete set null,
  credits int not null default 0,
  error text,
  discovered_at timestamptz not null default now(),
  fetched_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (supplier_id, url)
);

create index if not exists crawl_urls_status_idx on public.crawl_urls (status, supplier_id);
create index if not exists crawl_urls_supplier_idx on public.crawl_urls (supplier_id, status);

alter table public.crawl_urls enable row level security;
grant all on public.crawl_urls to service_role;
grant usage, select on sequence public.crawl_urls_id_seq to service_role;
