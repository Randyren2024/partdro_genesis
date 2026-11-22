create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null references public.supplier_profiles(supplier_id) on delete cascade,
  slug text unique,
  name text not null,
  name_en text,
  model text,
  brand text,
  category text,
  product_type text,
  summary text,
  description text,
  specifications jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  applications text[] not null default '{}',
  media jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  source_url text,
  source_urls jsonb not null default '[]'::jsonb,
  source_type text,
  verification_status text not null default 'unverified',
  crawl_status text not null default 'pending',
  crawler text not null default 'firecrawl-cli',
  language text not null default 'zh-CN',
  source_verified_at timestamptz,
  crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_supplier_idx on public.products (supplier_id);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_name_fts_idx on public.products using gin (to_tsvector('simple'::regconfig, coalesce(name,'') || ' ' || coalesce(model,'')));
create unique index if not exists products_supplier_model_key on public.products (supplier_id, model) where model is not null and model <> '';

create table if not exists public.crawl_pages (
  id bigserial primary key,
  supplier_id text not null references public.supplier_profiles(supplier_id) on delete cascade,
  url text not null,
  final_url text,
  page_type text,
  status text not null default 'ok',
  http_status int,
  title text,
  markdown_path text,
  excerpt text,
  image_count int not null default 0,
  video_count int not null default 0,
  credits int not null default 0,
  error text,
  fetched_at timestamptz not null default now(),
  unique (supplier_id, url)
);

create table if not exists public.crawl_queue (
  supplier_id text primary key references public.supplier_profiles(supplier_id) on delete cascade,
  priority int not null default 9,
  website text,
  seed_urls jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  attempts int not null default 0,
  pages int not null default 0,
  products int not null default 0,
  media int not null default 0,
  credits int not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.crawl_pages enable row level security;
alter table public.crawl_queue enable row level security;

drop policy if exists "Public can read products of listed suppliers" on public.products;
create policy "Public can read products of listed suppliers" on public.products
  for select to anon, authenticated
  using (exists (
    select 1 from public.supplier_profiles p
    join public.suppliers s on s.id = p.supplier_id
    where p.supplier_id = products.supplier_id and s.status = any (array['listed'::text,'verified'::text])
  ));

grant select on public.products to anon, authenticated;
grant all on public.products, public.crawl_pages, public.crawl_queue to service_role;
grant usage, select on sequence public.crawl_pages_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('supplier-media', 'supplier-media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read supplier-media') then
    create policy "Public read supplier-media" on storage.objects for select to anon, authenticated using (bucket_id = 'supplier-media');
  end if;
end $$;