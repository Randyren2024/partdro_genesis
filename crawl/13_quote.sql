create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  page_id uuid references public.product_pages(id) on delete set null,
  variant_id uuid,
  name text not null,
  email text not null,
  phone text,
  company text,
  country text,
  message text,
  locale text not null default 'en',
  source_page text,
  status text not null default 'new' check (status in ('new','contacted','quoted','closed','spam')),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists quote_requests_created_idx on public.quote_requests (created_at desc);
create index if not exists quote_requests_product_idx on public.quote_requests (product_id);

create table if not exists public.quote_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count int not null default 0
);

create or replace function public.consume_quote_rate_limit(p_key text, p_limit int default 3, p_window interval default '1 minute')
returns boolean
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into public.quote_rate_limits (key_hash, window_started_at, request_count)
  values (p_key, now(), 1)
  on conflict (key_hash) do update
    set request_count = case
        when public.quote_rate_limits.window_started_at < now() - p_window then 1
        else public.quote_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public.quote_rate_limits.window_started_at < now() - p_window then now()
        else public.quote_rate_limits.window_started_at
      end
  returning request_count into v_count;
  return v_count <= p_limit;
end $$;

alter table public.quote_requests enable row level security;
alter table public.quote_rate_limits enable row level security;

grant all on public.quote_requests, public.quote_rate_limits to service_role;
grant execute on function public.consume_quote_rate_limit(text, int, interval) to service_role;