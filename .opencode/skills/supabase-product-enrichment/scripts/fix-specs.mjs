import { runSQL, sqlQuote } from '../../../../crawl/lib.mjs';

// Curated, verifiable overrides for pages whose crawled values are Chinese or garbled.
// Only values that appear on the product page / manufacturer copy are used.
const CURATED = {
  'cz100-tethered-lighting': {
    set: {
      'Luminous flux': '112,000 lm',
      'Max illuminated area': '13,000 m2',
      'Lighting power': '800 W',
      'Centre illuminance': '47 lx at 30 m / 17 lx at 50 m',
      'Working height': '30-50 m',
      'Ingress protection': 'IP54',
    },
    add: {
      'Input voltage': ['Wide-range AC input (mains, generator, storage)', 'power'],
      'Communication': ['Powerline over tether', 'payload'],
      'Backup power': ['Dual supply with internal backup', 'power'],
    },
  },
  'q100-agricultural-drone': {
    set: {},
    add: {
      'Spray tank': ['50 L', 'payload'],
      'Nozzles': ['2 (standard spray kit)', 'payload'],
    },
  },
  'td550-coaxial-unmanned-helicopter': {
    add: {
      'Rotor configuration': ['Coaxial, no tail rotor', 'dimensions'],
    },
  },
  'unihangar-s1-automated-dock': {
    add: {
      'Charging': ['Automatic, in-dock', 'operations'],
      'Monitoring': ['Wind, temperature and video sensors', 'operations'],
      'Operation mode': ['Unattended dispatch and recovery', 'operations'],
      'Aircraft compatibility': ['Configurable for multiple platforms', 'compatibility'],
    },
  },
  'finix200m-flight-controller': {
    set: { 'RTK accuracy': 'Horizontal 10 cm + 1 ppm' },
    add: { 'Airframe class': ['Multirotor up to 100 kg', 'compatibility'] },
  },
  'finix300-flight-controller': {
    set: { 'RTK accuracy': 'Horizontal 10 cm + 1 ppm' },
    add: { 'Airframe class': ['Single-rotor up to 100 kg', 'compatibility'] },
  },
  'q20-quadcopter-platform': {
    delete: ['标准动力'],
    set: {
      'Dimensions (folded)': '559 x 455 x 335 mm (excluding landing gear)',
      'Max payload': '10 kg (custom) / 5.5 kg (standard)',
      'Takeoff weight': '16.7 kg (no payload) / 22 kg (max)',
      'Max operating altitude': '5,000 m standard / 7,000 m high-altitude',
      'Compatible payloads': 'Triple-sensor gimbal, 120 W searchlight, loudspeaker, combined light/speaker, six-point dropper, parachute, generator',
    },
  },
  'unilark-s6-inspection-drone': {
    set: { 'Payload': '30x optical zoom, configurable' },
    delete: ['轴距 1.2 m；两根红色机臂指示机头方向。'],
  },
  'm4d-tethered-lighting-drone': {
    set: {
      'Gimbal range': '-90 to +35 degrees, stabilised',
      'Dimensions': '490 x 285 x 470 mm',
      'Interfaces': 'LP12 input; XT30 lighting and battery outputs',
      'Luminous flux': '100,000 lm, about 168 lm/W',
      'Operating temperature': '-20 to 45 C (storage -40 to 65 C)',
      'Operating voltage': '800-1,000 VDC, tether supply',
      'Tether tension': '0-10 N, adjustable',
      'Lighting power': '600 W (1,200 W boost)',
      'Lighting mode': 'Combined beam, 14 degree angle, five-colour strobe',
      'Tether length': '33 m or 55 m (custom available)',
      'Input voltage': '600-850 VDC',
      'Output power': '2.8 kW rated / 3 kW peak',
      'Output voltage': '25 VDC regulated',
      'Ingress protection': 'IP54 airborne power, IPx4 tether box',
      'Tether speed': '0-3 m/s, variable acceleration',
      'Flight endurance': 'More than 24 h, dependent on external power',
    },
    delete: ['喊话方式'],
  },
};

const pages = await runSQL(`select pg.slug, pg.product_id from public.product_pages pg`);
const bySlug = new Map(pages.map((p) => [p.slug, p.product_id]));

for (const [slug, plan] of Object.entries(CURATED)) {
  const pid = bySlug.get(slug);
  if (!pid) { console.log('missing', slug); continue; }

  for (const [label, value] of Object.entries(plan.set || {})) {
    await runSQL(`update public.product_spec_values v set value=${sqlQuote(value)}, unit=null
      from public.product_specs ps
      where v.spec_id=ps.id and ps.product_id=${sqlQuote(pid)} and v.label=${sqlQuote(label)}`);
  }

  for (const label of plan.delete || []) {
    await runSQL(`delete from public.product_spec_values v using public.product_specs ps
      where v.spec_id=ps.id and ps.product_id=${sqlQuote(pid)} and v.label=${sqlQuote(label)}`);
    await runSQL(`delete from public.product_specs ps
      where ps.product_id=${sqlQuote(pid)} and not exists (select 1 from public.product_spec_values v where v.spec_id=ps.id)`);
  }

  for (const [label, [value, group]] of Object.entries(plan.add || {})) {
    const exists = await runSQL(`select 1 from public.product_spec_values v join public.product_specs ps on ps.id=v.spec_id
      where ps.product_id=${sqlQuote(pid)} and v.label=${sqlQuote(label)} limit 1`);
    if (exists.length) continue;
    const row = await runSQL(`insert into public.product_specs (product_id, group_key, position)
      values (${sqlQuote(pid)}, ${sqlQuote(group)},
        (select coalesce(max(position),0)+1 from public.product_specs where product_id=${sqlQuote(pid)})) returning id`);
    await runSQL(`insert into public.product_spec_values (spec_id, locale, label, value)
      values (${sqlQuote(row[0].id)}, 'en', ${sqlQuote(label)}, ${sqlQuote(value)})`);
  }

  console.log('fixed', slug);
}