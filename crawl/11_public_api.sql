create or replace function public.get_product_page(p_slug text, p_locale text default 'en')
returns jsonb
language sql
stable
as $$
  with pg as (
    select * from public.product_pages where slug = p_slug and status = 'published'
  ),
  tr as (
    select * from public.product_page_translations
    where page_id = (select id from pg) and locale = p_locale
  )
  select jsonb_build_object(
    'page', jsonb_build_object(
      'slug', (select slug from pg),
      'template', (select template from pg),
      'locale', (select locale from tr),
      'seo', jsonb_build_object(
        'title', (select seo_title from tr),
        'description', (select seo_description from tr)
      ),
      'eyebrow', (select eyebrow from tr),
      'headline', (select headline from tr),
      'subheadline', (select subheadline from tr),
      'cta', jsonb_build_object(
        'primary', (select cta_primary from tr),
        'secondary', (select cta_secondary from tr)
      ),
      'intro', (select intro_md from tr),
      'published_at', (select published_at from pg)
    ),
    'product', (
      select jsonb_build_object(
        'name', pr.name, 'name_en', pr.name_en, 'model', pr.model,
        'category', pr.category, 'summary', pr.summary
      )
      from public.products pr where pr.id = (select product_id from pg)
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'position', s.position, 'media_id', s.media_id,
        'data', (s.data || coalesce(st.data, '{}'::jsonb)),
        'media', (
          select jsonb_build_object('public_url', m.public_url, 'role', m.role,
            'alt', coalesce(m.alt_i18n->>p_locale, m.alt_i18n->>'en'))
          from public.media_assets m where m.id = s.media_id and m.is_public
        )
      ) order by s.position)
      from public.product_sections s
      left join public.product_section_translations st
        on st.section_id = s.id and st.locale = p_locale
      where s.page_id = (select id from pg) and s.is_visible
    ), '[]'::jsonb),
    'specs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', sp.group_key, 'label', sv.label, 'value', sv.value, 'unit', sv.unit
      ) order by sp.position)
      from public.product_specs sp
      join public.product_spec_values sv on sv.spec_id = sp.id and sv.locale = p_locale
      where sp.product_id = (select product_id from pg)
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object('q', fl.question, 'a', fl.answer) order by f.position)
      from public.product_faqs f
      join public.product_faq_langs fl on fl.faq_id = f.id and fl.locale = p_locale
      where f.product_id = (select product_id from pg) and f.is_visible
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('marker', n.marker, 'body', nl.body) order by n.position)
      from public.product_notes n
      join public.product_note_langs nl on nl.note_id = n.id and nl.locale = p_locale
      where n.product_id = (select product_id from pg)
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'role', m.role, 'url', m.public_url, 'derivatives', m.derivatives,
        'alt', coalesce(m.alt_i18n->>p_locale, m.alt_i18n->>'en')
      ) order by m.role, m.sort_order)
      from public.media_assets m
      where m.product_id = (select product_id from pg) and m.is_public
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'url', d.public_url, 'mime', d.mime) order by d.position)
      from public.product_documents d
      where d.product_id = (select product_id from pg)
    ), '[]'::jsonb)
  ) || jsonb_build_object('available', exists(select 1 from pg))
$$;

grant execute on function public.get_product_page(text, text) to anon, authenticated;
grant execute on function public.get_product_page(text, text) to service_role;


