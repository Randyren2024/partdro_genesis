create extension if not exists pgcrypto;

create table if not exists public.product_categories (
  slug text primary key,
  name_i18n jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.product_categories (slug, name_i18n, position) values
  ('helicopter', '{"en":"Unmanned Helicopter","zh-CN":"无人直升机"}', 10),
  ('multirotor', '{"en":"Multirotor Drone","zh-CN":"多旋翼无人机"}', 20),
  ('vtol', '{"en":"VTOL / eVTOL","zh-CN":"垂直起降/电动垂直起降"}', 30),
  ('fixed-wing', '{"en":"Fixed-Wing UAV","zh-CN":"固定翼无人机"}', 40),
  ('flight-control', '{"en":"Flight Control & Avionics","zh-CN":"飞控与航电"}', 50),
  ('payload', '{"en":"Payload & Sensor","zh-CN":"载荷与传感器"}', 60),
  ('components', '{"en":"Components","zh-CN":"零部件"}', 70),
  ('agricultural', '{"en":"Agricultural Drone","zh-CN":"农业无人机"}', 80),
  ('defense', '{"en":"Defense & Counter-UAS","zh-CN":"防务与反无人机"}', 90),
  ('logistics', '{"en":"Logistics Drone","zh-CN":"物流无人机"}', 100)
on conflict (slug) do update set name_i18n = excluded.name_i18n, position = excluded.position;

create table if not exists public.product_pages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  slug text not null unique,
  template text not null default 'product_v2',
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  hero_media_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_page_translations (
  page_id uuid not null references public.product_pages(id) on delete cascade,
  locale text not null default 'en',
  seo_title text,
  seo_description text,
  eyebrow text,
  headline text,
  subheadline text,
  cta_primary text,
  cta_secondary text,
  intro_md text,
  primary key (page_id, locale)
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  page_id uuid references public.product_pages(id) on delete set null,
  kind text not null check (kind in ('image','video','video_embed','document')),
  role text not null default 'gallery',
  storage_path text,
  public_url text,
  source_url text,
  mime text,
  bytes bigint,
  width int,
  height int,
  duration_s numeric,
  sha256 text,
  alt_i18n jsonb not null default '{}'::jsonb,
  caption_i18n jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists media_assets_product_idx on public.media_assets (product_id, role, sort_order);
create unique index if not exists media_assets_sha_uidx on public.media_assets (product_id, sha256) where sha256 is not null;

create table if not exists public.product_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.product_pages(id) on delete cascade,
  kind text not null,
  position int not null default 0,
  is_visible boolean not null default true,
  media_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists product_sections_page_idx on public.product_sections (page_id, position);

create table if not exists public.product_section_translations (
  section_id uuid not null references public.product_sections(id) on delete cascade,
  locale text not null default 'en',
  data jsonb not null default '{}'::jsonb,
  primary key (section_id, locale)
);

create table if not exists public.product_specs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  group_key text not null default 'general',
  position int not null default 0
);
create index if not exists product_specs_product_idx on public.product_specs (product_id, position);

create table if not exists public.product_spec_values (
  spec_id uuid not null references public.product_specs(id) on delete cascade,
  locale text not null default 'en',
  label text not null,
  value text not null,
  unit text,
  primary key (spec_id, locale)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null,
  kind text not null default 'edition' check (kind in ('edition','package')),
  position int not null default 0,
  image_media_id uuid,
  is_default boolean not null default false,
  unique (product_id, code)
);

create table if not exists public.product_variant_langs (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  locale text not null default 'en',
  name text not null,
  description text,
  primary key (variant_id, locale)
);

create table if not exists public.product_variant_values (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  locale text not null default 'en',
  label text not null,
  value text not null,
  position int not null default 0,
  primary key (variant_id, locale, label)
);

create table if not exists public.product_payloads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null,
  position int not null default 0,
  image_media_id uuid
);

create table if not exists public.product_payload_langs (
  payload_id uuid not null references public.product_payloads(id) on delete cascade,
  locale text not null default 'en',
  name text not null,
  description text,
  primary key (payload_id, locale)
);

create table if not exists public.product_faqs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  position int not null default 0,
  is_visible boolean not null default true
);

create table if not exists public.product_faq_langs (
  faq_id uuid not null references public.product_faqs(id) on delete cascade,
  locale text not null default 'en',
  question text not null,
  answer text not null,
  primary key (faq_id, locale)
);

create table if not exists public.product_notes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  marker text not null,
  position int not null default 0
);

create table if not exists public.product_note_langs (
  note_id uuid not null references public.product_notes(id) on delete cascade,
  locale text not null default 'en',
  body text not null,
  primary key (note_id, locale)
);

create table if not exists public.product_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null default 'datasheet',
  storage_path text,
  public_url text,
  mime text,
  bytes bigint,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.product_pages(id) on delete cascade,
  snapshot jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.product_pages enable row level security;
alter table public.media_assets enable row level security;
alter table public.product_sections enable row level security;

drop policy if exists "Public can read published pages" on public.product_pages;
create policy "Public can read published pages" on public.product_pages
  for select to anon, authenticated using (status = 'published');

drop policy if exists "Public can read public media" on public.media_assets;
create policy "Public can read public media" on public.media_assets
  for select to anon, authenticated using (is_public);

drop policy if exists "Public can read sections of published pages" on public.product_sections;
create policy "Public can read sections of published pages" on public.product_sections
  for select to anon, authenticated using (exists (
    select 1 from public.product_pages p where p.id = product_sections.page_id and p.status = 'published'
  ));

create or replace view public.public_product_pages as
select
pg.id as page_id,
  pg.product_id,
  pg.slug,
  pg.template,
  t.locale,
  t.seo_title,
  t.seo_description,
  t.eyebrow,
  t.headline,
  t.subheadline,
  t.cta_primary,
  t.cta_secondary,
  t.intro_md,
  pr.name,
  pr.name_en,
  pr.model,
  pr.category,
  pr.summary,
  pr.description,
  pr.specifications,
  pr.features,
  pr.applications,
  pg.published_at
from public.product_pages pg
join public.product_page_translations t on t.page_id = pg.id
join public.products pr on pr.id = pg.product_id
where pg.status = 'published';

grant select on public.public_product_pages to anon, authenticated;
grant select on public.product_pages, public.media_assets, public.product_sections to anon, authenticated;
grant all on public.product_categories, public.product_pages, public.product_page_translations,
  public.media_assets, public.product_sections, public.product_section_translations,
  public.product_specs, public.product_spec_values, public.product_variants,
  public.product_variant_langs, public.product_variant_values, public.product_payloads,
  public.product_payload_langs, public.product_faqs, public.product_faq_langs,
  public.product_notes, public.product_note_langs, public.product_documents,
  public.product_page_revisions to service_role;


