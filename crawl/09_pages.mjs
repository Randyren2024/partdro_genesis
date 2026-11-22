import { runSQL, sqlQuote, jsonSql, sleep } from './lib.mjs';

const TARGET_SQL = `
  (supplier_id='supplier-007' and model in ('Q20','TD220','Q100','TD550','T1400'))
  or (supplier_id='supplier-009' and model in ('D30','D60','ZMD200','D10'))
  or (supplier_id='supplier-001' and model in ('Unilark','Finix200M','Finix300','Finix3000','Unihangar'))
  or (supplier_id='supplier-088' and model='CZ100')
  or (supplier_id='supplier-156' and name like 'Matrice 4D%')
`;

const SPEC_MAP = {
  '最大起飞重量': ['Max takeoff weight', 'performance'],
  '起飞重量': ['Takeoff weight', 'performance'],
  '最大载荷': ['Max payload', 'performance'],
  '最大载重': ['Max payload', 'performance'],
  '额定载重': ['Rated payload', 'performance'],
  '最大有效载荷': ['Max useful payload', 'performance'],
  '载荷': ['Payload', 'performance'],
  '可搭载载荷': ['Compatible payloads', 'payload'],
  '最大水平飞行速度': ['Max horizontal speed', 'performance'],
  '最大平飞速度': ['Max level speed', 'performance'],
  '最大飞行速度': ['Max flight speed', 'performance'],
  '最大飞行速度前向': ['Max forward speed', 'performance'],
  '巡航速度': ['Cruise speed', 'performance'],
  '最大上升速度': ['Max climb rate', 'performance'],
  '最大下降速度': ['Max descent rate', 'performance'],
  '实用升限': ['Service ceiling', 'performance'],
  '最大飞行海拔高度': ['Max operating altitude', 'performance'],
  '最大飞行高度': ['Max flight height', 'performance'],
  '无地效悬停高度': ['Hover ceiling (OGE)', 'performance'],
  '典型任务半径': ['Typical mission radius', 'performance'],
  '最大飞行半径': ['Max operating radius', 'performance'],
  '最大续航': ['Max endurance', 'performance'],
  '续航时间': ['Endurance', 'performance'],
  '空载续航': ['Endurance (no payload)', 'performance'],
  '滞空时间': ['Endurance on station', 'performance'],
  '支持飞行时长': ['Flight endurance', 'performance'],
  '支持飞行高度': ['Operating height', 'performance'],
  '抗风能力': ['Wind resistance', 'environment'],
  '抗风等级': ['Wind rating', 'environment'],
  '起降抗风': ['Wind limit (takeoff/landing)', 'environment'],
  '工作温度': ['Operating temperature', 'environment'],
  '防护等级': ['Ingress protection', 'environment'],
  '定位精度': ['Positioning accuracy', 'navigation'],
  '悬停精度': ['Hover accuracy', 'navigation'],
  '悬停精度水平方向': ['Hover accuracy (horizontal)', 'navigation'],
  'RTK定位精度': ['RTK accuracy', 'navigation'],
  '垂直方向': ['Vertical accuracy', 'navigation'],
  '水平': ['Horizontal accuracy', 'navigation'],
  '轴距': ['Wheelbase', 'dimensions'],
  '展开尺寸': ['Dimensions (unfolded)', 'dimensions'],
  '收纳尺寸': ['Dimensions (folded)', 'dimensions'],
  '外形尺寸': ['Dimensions', 'dimensions'],
  '尺寸': ['Dimensions', 'dimensions'],
  '机体尺寸': ['Airframe dimensions', 'dimensions'],
  '机身长度': ['Fuselage length', 'dimensions'],
  '翼展': ['Wingspan', 'dimensions'],
  '重量': ['Weight', 'dimensions'],
  '尺寸和重量': ['Controller size & weight', 'dimensions'],
  '单轴拉力': ['Thrust per axis', 'performance'],
  '电压范围': ['Voltage range', 'power'],
  '工作电压': ['Operating voltage', 'power'],
  '输入电压': ['Input voltage', 'power'],
  '输出电压': ['Output voltage', 'power'],
  '输出功率': ['Output power', 'power'],
  '功率（工作）': ['Operating power', 'power'],
  '最大功耗': ['Max power', 'power'],
  '照明功率': ['Lighting power', 'payload'],
  '灯组亮度': ['Lamp output', 'payload'],
  '光通量': ['Luminous flux', 'payload'],
  '中心照度': ['Centre illuminance', 'payload'],
  '单机照明范围': ['Illumination coverage', 'payload'],
  '照明面积': ['Illuminated area', 'payload'],
  '系缆长度': ['Tether length', 'power'],
  '收放拉力': ['Tether tension', 'power'],
  '收放线速度': ['Tether speed', 'power'],
  '油箱容量': ['Fuel capacity', 'power'],
  '部署时间': ['Deployment time', 'operations'],
  '云台': ['Gimbal range', 'payload'],
  '接口': ['Interfaces', 'payload'],
  '任务载荷设备': ['Payload device', 'payload'],
  '适配机型': ['Compatible aircraft', 'compatibility'],
  '最大照明范围': ['Max illuminated area', 'payload'],
  '最大照明面积': ['Max illuminated area', 'payload'],
  '作业高度': ['Operating height', 'payload'],
  '照明方式': ['Lighting mode', 'payload'],
  '灯组重量': ['Lamp weight', 'payload'],
  '收放线速度': ['Tether speed', 'power']
};
const JUNK_KEY = /(电话|地址|热线|服务时间|市场合作|技术支持|周一到周|里程碑|Milestone|咨询|邮箱|网址|微信|QQ|邮编)/i;

function normSpecs(specs) {
  const out = [];
  const seen = new Set();
  for (const [k, v] of Object.entries(specs || {})) {
    if (!v || typeof v !== 'string') continue;
    if (JUNK_KEY.test(k)) continue;
    if (k.includes('@') && /min/i.test(k)) {
      out.push({ label: 'Endurance / payload', value: k, unit: null, group: 'performance' });
      if (/m\s*$/.test(v)) out.push({ label: 'Service ceiling', value: v, unit: null, group: 'performance' });
      continue;
    }
    if (/^\d{3,4}-?\d{7,8}$/.test(v.trim()) || /@/.test(v)) continue;
    if (/\d{4}-\d{2}-\d{2}/.test(v)) continue;
    const hit = SPEC_MAP[k];
    const label = hit ? hit[0] : (k.length <= 32 ? k : null);
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, value: tSpec(v.trim()), unit: null, group: hit ? hit[1] : 'general' });
  }
  return out.slice(0, 24);
}

const SPEC_PHRASES = [
  ['机臂+桨叶展开', 'arms and props unfolded'],
  ['机臂+桨叶折叠', 'arms and props folded'],
  ['海平面', 'sea level'],
  ['播撒', 'spreading'],
  ['喷洒', 'spraying'],
  ['标配', 'standard'],
  ['选配', 'optional'],
  ['加装', 'fitted with'],
  ['含油', 'incl. fuel'],
  ['空载', 'no payload'],
  ['可扩展', 'expandable'],
  ['大于', 'more than'],
  ['天窗关闭', 'roof closed'],
  ['天窗打开', 'roof open'],
  ['前向', 'forward'],
  ['侧向', 'lateral'],
  ['水平方向', 'horizontal'],
  ['垂直方向', 'vertical'],
  ['作业高度', 'working height'],
  ['载荷', 'payload'],
  ['喷头', 'nozzles'],
  ['作业箱', 'tank'],
  ['果树套件', 'orchard kit'],
  ['公斤', 'kg'],
  ['千克', 'kg'],
  ['无地效', 'OGE'],
  ['续航', 'endurance'],
  ['飞行', 'flight'],
  ['重量', 'weight'],
  ['尺寸', 'dimensions'],
  ['长×宽×高', 'L x W x H'],
  ['（', ' ('], ['）', ')'],
  ['，', ', '], ['、', ', ']
];

function tSpec(value) {
  let v = String(value);
  for (const [zh, en] of SPEC_PHRASES) v = v.split(zh).join(en);
  return v.replace(/([a-z])(\d)/gi, ' ').replace(/\s+/g, ' ').trim();
}

function splitLabelValue(label, value) {
  const m = String(value).match(/^([\d.,~<>±\-–\s\/]+)\s*(kg|g|mm|cm|m|km|km\/h|m\/s|min|h|%|W|kW|V|Ah|LM|lux|L|l|dB|TOPS|级|°)\.?$/i);
  if (m) return { label, value: m[1].trim(), unit: m[2] };
  return { label, value: String(value), unit: null };
}

const CURATED = {
  'Q100 Agricultural Drone': {
    slug: 'q100-agricultural-drone',
    eyebrow: 'PD-Q100 · Agricultural platform',
    sub: '65 kg rated payload and a 50 L spray tank on a folding airframe built for orchard and field work.',
    intro: `The Q100 is a single-operator agricultural aircraft that changes between spraying, spreading and orchard configurations without changing platforms.\n\nA 50 L tank and 65 kg rated payload cover most field work, while the folding frame (1.1 × 0.83 × 0.83 m) fits a standard pickup bed for transport between plots.`,
    stats: [['Rated payload', '65', 'kg'], ['Spray tank', '50', 'L'], ['Max takeoff weight', '126', 'kg'], ['Max speed', '13.8', 'm/s']],
    features: [
      ['Spray or spread on one airframe', 'Swap the 50 L spray tank for a granular spreader without re-tuning the platform.'],
      ['Folded for the road', 'Arms and props fold to 1.1 × 0.83 × 0.83 m, so one operator can move the aircraft between plots.'],
      ['Steady in field conditions', 'Rated for 6 m/s winds and a 30 m working height for low, controlled passes.'],
      ['2 km working radius', 'A 2 km operating radius keeps the aircraft inside the plot and the operator out of the spray.'],
    ],
    apps: [
      ['Field spraying', 'Liquid application across row crops with a 50 L tank.'],
      ['Orchard work', 'Fruit-tree spraying with the orchard kit and two nozzles.'],
      ['Granular spreading', 'Seed and fertiliser spreading with the spreader module.'],
      ['Farm logistics', 'Short-haul transport of inputs and harvested samples.'],
    ],
    faq: [
      ['What payload can the Q100 carry?', 'A rated 65 kg across the spray and spread configurations; maximum takeoff weight is 126 kg.'],
      ['What is the spray tank capacity?', '50 L with the standard two-nozzle spray kit.'],
      ['Can it work in wind?', 'The platform is rated for 6 m/s winds; keep passes low and plan routes with the wind in mind.'],
      ['How is it transported?', 'Arms and propellers fold to 1.1 × 0.83 × 0.83 m for transport.'],
      ['What is the working radius?', 'Up to 2 km, which covers most single-plot operations.'],
      ['How do I get pricing?', 'Send the crop, plot size and terrain through the quote form and our team will reply with a configuration.'],
    ],
  },
  'Q20 Quadcopter Platform': {
    slug: 'q20-quadcopter-platform',
    eyebrow: 'PD-Q20 · Multi-role quadcopter',
    sub: '10 kg payload, 27 m/s top speed and a high-altitude power option for work above 5,000 m.',
    intro: `The Q20 is a multi-role quadcopter that carries gimbals, searchlights, speakers, drop systems and parachutes on one airframe.\n\nIt folds to 559 × 455 × 335 mm, weighs 16.7 kg empty, and takes either a standard power system for 5,000 m or a high-altitude system rated to 7,000 m.`,
    stats: [['Max payload', '10', 'kg'], ['Max speed', '27', 'm/s'], ['Service ceiling', '7,000', 'm'], ['Empty weight', '16.7', 'kg']],
    features: [
      ['One airframe, many payloads', 'Three-sensor gimbals, 120 W searchlights, speakers, drop systems and parachutes share the same mounting points.'],
      ['Folds into a case', 'Arms and props fold to 559 × 455 × 335 mm for transport and field deployment.'],
      ['High-altitude option', 'The high-altitude power system raises the service ceiling from 5,000 m to 7,000 m.'],
      ['Fast to reposition', '27 m/s maximum horizontal speed and 6 m/s climb shorten transit between task areas.'],
    ],
    apps: [
      ['Inspection', 'Gimbal and zoom payloads for asset and infrastructure inspection.'],
      ['Logistics', 'Drop systems for short-haul delivery to inaccessible sites.'],
      ['Emergency response', 'Lighting and speaker payloads for night search and public messaging.'],
      ['Survey and mapping', 'Stable flight and precise hover for photogrammetry missions.'],
    ],
    faq: [
      ['What payloads does the Q20 support?', 'Three-sensor gimbals, 120 W searchlights, speakers, combined light/speaker units, drop systems and parachutes.'],
      ['What is the maximum payload?', '10 kg with the custom configuration, 5.5 kg in the standard configuration.'],
      ['How high can it operate?', '5,000 m with the standard power system and 7,000 m with the high-altitude option.'],
      ['How fast is it?', 'Up to 27 m/s horizontally, with 6 m/s climb and 5 m/s descent.'],
      ['Is it transportable?', 'Yes — it folds to 559 × 455 × 335 mm without the landing gear.'],
      ['How do I choose a configuration?', 'Share the mission altitude and payload through the quote form and our team will specify the power option.'],
    ],
  },
  'TD550 Coaxial Unmanned Helicopter': {
    slug: 'td550-coaxial-unmanned-helicopter',
    eyebrow: 'PD-TD550 · Heavy-lift coaxial helicopter',
    sub: '260 kg payload and a 730 kg maximum takeoff weight, with a 6,500 m service ceiling.',
    intro: `The TD550 is a coaxial unmanned helicopter built for heavy payloads at altitude, with a 260 kg useful load at sea level and a 200 km typical mission radius.\n\nCoaxial rotors remove the tail rotor, shortening the airframe and improving control in confined landing areas while keeping a 180 km/h maximum level speed.`,
    stats: [['Max payload', '260', 'kg'], ['Max takeoff', '730', 'kg'], ['Service ceiling', '6,500', 'm'], ['Mission radius', '200', 'km']],
    features: [
      ['260 kg useful load', 'Lifts cargo, sensors and rescue equipment that fixed-wing or small multirotors cannot carry.'],
      ['Coaxial rotor layout', 'No tail rotor means a compact footprint and stable control for confined landing zones.'],
      ['High-altitude performance', '6,500 m service ceiling and a 5,000 m hover ceiling without ground effect.'],
      ['200 km mission radius', 'Long transit legs with a 100–120 km/h cruise for regional logistics and emergency response.'],
    ],
    apps: [
      ['Emergency rescue', 'Rapid delivery of medical and rescue supplies to blocked or remote sites.'],
      ['Heavy logistics', 'Bulk cargo transfer where roads are unavailable or too slow.'],
      ['Firefighting support', 'Heavy payload carriage for firefighting logistics and equipment movement.'],
      ['High-altitude operations', 'Plateau transport and survey missions above 5,000 m.'],
    ],
    faq: [
      ['What is the maximum payload?', '260 kg at sea level.'],
      ['What is the maximum takeoff weight?', '730 kg at sea level.'],
      ['How high can the TD550 operate?', 'A 6,500 m service ceiling, with a 5,000 m hover ceiling out of ground effect.'],
      ['What is the mission radius?', 'A typical mission radius of 200 km at cruise speeds of 100–120 km/h.'],
      ['How fast does it fly?', 'Up to 180 km/h in level flight.'],
      ['Can it carry a custom payload?', 'Yes — payload integration is configured per mission; send the payload envelope through the quote form.'],
    ],
  },
  'ZMD200 Heavy-Lift Multirotor Drone': {
    slug: 'zmd200-heavy-lift-multirotor',
    eyebrow: 'PD-ZMD200 · Heavy-lift multirotor',
    sub: '200 kg payload, 195 kg thrust per axis and a tethered lighting mode that stays up for 24 hours.',
    intro: `The ZMD200 separates the flight platform from the work module, so one aircraft can carry cargo, a lighting array or a rescue system.\n\nWith 200 kg maximum payload, 195 kg of thrust per axis and a 6-level wind rating, it is built for mountain logistics, construction lifting and emergency work.`,
    stats: [['Max payload', '200', 'kg'], ['Thrust per axis', '195', 'kg'], ['Tethered endurance', '24', 'h'], ['Deployment', '3', 'min']],
    features: [
      ['200 kg on the hook', 'A single-point cargo hook with electric release and real-time weighing for heavy lifts.'],
      ['Tethered power', 'Ground power through the tether keeps the aircraft on station for 24 hours or more.'],
      ['108,000 lm lighting', 'The lighting module covers 6,000 m with a single aircraft; multiple aircraft stack coverage.'],
      ['Three-minute deployment', 'One operator can set up and launch in about three minutes for time-critical work.'],
    ],
    apps: [
      ['Mountain logistics', 'Supply delivery to sites without road access.'],
      ['Construction lifting', 'Moving materials onto structures and between levels.'],
      ['Orchard transport', 'Carrying harvested fruit and inputs across steep terrain.'],
      ['Emergency and fire', 'Lighting, supply drops and search support at night.'],
    ],
    faq: [
      ['What is the maximum payload?', '200 kg.'],
      ['How long can it stay airborne?', 'In tethered mode the platform can remain on station for 24 hours or more; free-flight endurance depends on payload and battery configuration.'],
      ['What is the wind limit?', 'Level 6 wind rating.'],
      ['How large an area can it light?', 'A single aircraft covers about 6,000 m; multiple aircraft can be combined for larger areas.'],
      ['How fast can it be deployed?', 'Roughly three minutes with one operator.'],
      ['Can it carry different modules?', 'Yes — flight platform and work module are separate, so cargo, lighting and rescue modules can be swapped.'],
    ],
  },
  'Unilark S6 Inspection Drone': {
    slug: 'unilark-s6-inspection-drone',
    eyebrow: 'PD-Unilark S6 · Inspection platform',
    sub: '8 kg payload, 30 minutes of flight, IP54 sealing and centimetre-level positioning for automated inspection.',
    intro: `The Unilark S6 is a six-rotor inspection aircraft designed to work from an automated dock as well as from the ground.\n\nA 1.2 m wheelbase, folding arms and swappable payloads let one aircraft carry a 30× zoom camera, a cargo box or a drop system across inspection rounds and short logistics tasks.`,
    stats: [['Max payload', '8', 'kg'], ['Max endurance', '30', 'min'], ['Wind rating', '5', ''], ['Ingress protection', 'IP54', '']],
    features: [
      ['Centimetre-level positioning', '±15 cm positioning accuracy keeps the aircraft stable close to structures and equipment.'],
      ['Payloads in the field', 'Folding arms, removable landing gear and a quick payload mount for camera, cargo or drop modules.'],
      ['Built for weather', 'IP54 sealing and a 5-level wind rating for routine outdoor inspection.'],
      ['Redundant navigation', 'Redundant satellite navigation and heading systems for reliable automatic flight.'],
    ],
    apps: [
      ['Power and utility inspection', 'Close inspection of lines, towers and substations with a zoom payload.'],
      ['Industrial sites', 'Routine rounds over tanks, stacks and roofs.'],
      ['Security patrol', 'Scheduled perimeter and yard patrol routes.'],
      ['Short-haul delivery', '8 kg payload drops from the same airframe.'],
    ],
    faq: [
      ['What is the maximum payload?', '8 kg, including gimbal cameras and cargo modules.'],
      ['How long can it fly?', 'Up to 30 minutes in the standard configuration.'],
      ['Does it work with a dock?', 'Yes — it is designed to pair with the Unihangar automated dock for unattended operations.'],
      ['What is the positioning accuracy?', '±15 cm.'],
      ['Can it fly in rain?', 'It is IP54 rated for dust and water spray, and rated to level 5 wind.'],
      ['How do I configure a payload?', 'Tell us the inspection target and required stand-off distance; we will specify the camera or module.'],
    ],
  },
  'Matrice 4D Tethered Drone': {
    slug: 'm4d-tethered-lighting-drone',
    eyebrow: 'PD-M4D · Tethered lighting & surveillance',
    sub: '24 hours on station, 600 W of lighting and a 55 m tether, powered from the ground.',
    intro: `The M4D tethered system keeps a multirotor airborne from ground power instead of batteries, so lighting, communications or surveillance payloads stay up through the night.\n\nA 2.8 kW ground station feeds a 25 V on-board supply through a 33 m or 55 m tether, while the lighting module delivers 600 W in standard mode and 1,200 W in boost mode.`,
    stats: [['Flight endurance', '24', 'h+'], ['Lighting power', '600', 'W'], ['Tether length', '55', 'm'], ['Ground output', '2.8', 'kW']],
    features: [
      ['Continuous ground power', 'The tether removes battery swaps and keeps the aircraft on station for 24 hours or more.'],
      ['600 W / 1,200 W lighting', 'A five-colour strobe and 14° beam produce 30 lux at 50 m and 3 lux at 150 m.'],
      ['Stable 25 V supply', 'The on-board supply holds a regulated 25 V output from a 600–850 VDC input.'],
      ['Fast tether control', 'The winch adjusts tension and speed from 0 to 3 m/s for changing wind and altitude.'],
    ],
    apps: [
      ['Night lighting', 'Large-area illumination for construction, emergency and event sites.'],
      ['Emergency response', 'Sustained light and surveillance over incident scenes.'],
      ['Security', 'Persistent observation over perimeters and yards.'],
      ['Telecommunications', 'Long-duration airborne relay or sensor carriage.'],
    ],
    faq: [
      ['How long can it stay airborne?', 'More than 24 hours, limited by the external power source rather than the aircraft battery.'],
      ['How much light does it produce?', '600 W standard and 1,200 W boost, with 30 lux at 50 m and 3 lux at 150 m.'],
      ['How long is the tether?', '33 m or 55 m as standard, with custom lengths available.'],
      ['What power does it need?', 'A ground station delivering 2.8 kW rated and 3 kW peak.'],
      ['Can it fly in wind?', 'The system is designed for sustained outdoor use; confirm the site wind profile with our team before deployment.'],
['Which aircraft does it use?', 'The system is configured around the M4D airframe; the tether kit is supplied as a complete package.'],
    ],
  },
  'CZ100 Tethered Lighting System': {
    slug: 'cz100-tethered-lighting',
    eyebrow: 'PD-CZ100 · Tethered lighting system',
    sub: '112,000 lumens and more than 13,000 m² of coverage from a ground-powered tethered platform.',
    intro: `The CZ100 is a tethered lighting system for emergency response, night construction and rescue work, built to stay lit for as long as ground power is available.\n\nAn 800 W LED array produces 112,000 lumens, with 13,000 m² of illuminated area and a centre illuminance above 47 lux at a 30 m working height.`,
    stats: [['Luminous flux', '112,000', 'lm'], ['Illuminated area', '13,000', 'm²'], ['Lighting power', '800', 'W'], ['Centre lux at 30 m', '47', 'lx']],
    features: [
      ['Light that stays up', 'Ground power through the tether removes battery limits, so the site stays lit through the night.'],
      ['Wide voltage input', 'Connects to mains power, outdoor energy storage, generators or a new-energy vehicle.'],
      ['Dual power backup', 'If the primary supply fails, an internal backup takes over so the platform can land safely.'],
      ['Powerline communication', 'Video and control travel over the tether, so the link is not affected by radio interference.'],
    ],
    apps: [
      ['Emergency lighting', 'Night-time incident scenes and rescue operations.'],
      ['Construction', 'Sustained lighting for night shifts and lifting operations.'],
      ['Utilities and repair', 'Work sites near high-voltage lines where grounding and isolation matter.'],
      ['Events and security', 'Large-area lighting for temporary sites and patrols.'],
    ],
    faq: [
      ['How much light does the CZ100 produce?', '112,000 lumens, with 13,000 m² of illuminated area.'],
      ['How bright is it at working height?', 'Above 47 lux at the centre at a 30 m working height, and 17 lux at 50 m.'],
      ['What power input does it accept?', 'A wide voltage range, covering mains supply, outdoor energy storage, generators and electric vehicles.'],
      ['What happens if power fails?', 'A dual power system switches to an internal backup so the platform can land safely.'],
      ['Is the control link affected by radio interference?', 'No — video and control are carried over the tether using powerline communication.'],
      ['How do I get pricing?', 'Send the site size, working height and power availability through the quote form for a configuration.'],
    ],
  },
  'Finix200M Flight Controller': {
    slug: 'finix200m-flight-controller',
    eyebrow: 'PD-Finix200M · Multirotor flight control',
    sub: 'A flight controller for multirotors up to 100 kg, with RTK expansion and app-based autonomous operation.',
    intro: `The Finix200M is a flight control system for multirotor airframes below 100 kg, built for builders who need autonomous waypoint flight without a bespoke autopilot project.\n\nIt supports custom airframes, remote-controller or app operation, optional RTK positioning and a standard cloud account for mission management.`,
    stats: [['Airframe class', '100', 'kg'], ['Hover accuracy', '±30', 'cm'], ['Wind limit', '8', 'm/s'], ['Input', '3S–12S', '']],
    features: [
      ['Fits custom airframes', 'Parameter sets cover multirotor layouts, so the same controller serves several builds.'],
      ['Autonomous by app', 'Waypoint missions run from the app without a separate ground station.'],
      ['RTK-ready', 'Add an RTK module for 10 cm + 1 ppm horizontal positioning.'],
      ['Built-in safety logic', 'Flight safety policies are enforced by the controller rather than the operator.'],
    ],
    apps: [
      ['Industrial inspection', 'Stable automated routes for asset inspection.'],
      ['Agriculture', 'Waypoint spraying and mapping missions.'],
      ['Logistics', 'Short-haul delivery builds under 100 kg.'],
      ['Custom platforms', 'Integrator projects that need an off-the-shelf autopilot.'],
    ],
    faq: [
      ['What aircraft does the Finix200M suit?', 'Multirotors with a takeoff weight below 100 kg; parameters can be adapted to custom frames.'],
      ['Does it support RTK?', 'Yes — RTK is optional, with horizontal accuracy of 10 cm + 1 ppm.'],
      ['Can it fly without a remote controller?', 'Yes, missions can be flown fully autonomously from the app, with manual control available as an option.'],
      ['What is the wind limit?', 'Below 8 m/s for normal operation.'],
      ['What input voltage does it accept?', '3S to 12S battery packs.'],
      ['How do I get pricing?', 'Send the airframe class and mission profile through the quote form; our team replies with a configuration.'],
    ],
  },
  'Finix300 Flight Controller': {
    slug: 'finix300-flight-controller',
    eyebrow: 'PD-Finix300 · Single-rotor flight control',
    sub: 'A flight controller for single-rotor airframes up to 100 kg, compatible with both fuel and electric power.',
    intro: `The Finix300 is a flight control system for single-rotor helicopters and similar layouts up to 100 kg, with separate IMU units and support for both fuel and electric powertrains.\n\nMissions can run from the app or a remote controller, with RTK expansion and a standard cloud account for fleet and mission data.`,
    stats: [['Airframe class', '100', 'kg'], ['Hover accuracy', '±30', 'cm'], ['Wind limit', '8', 'm/s'], ['Power', 'Fuel / electric', '']],
    features: [
      ['Single-rotor control', 'Tuned for helicopter and single-rotor layouts rather than multirotor defaults.'],
      ['Fuel or electric', 'One controller supports both powertrain types on compatible airframes.'],
      ['Separate IMUs', 'Discrete inertial units for redundancy and vibration tolerance.'],
      ['Autonomous missions', 'One-tap autonomous operation from the app, with manual override.'],
    ],
    apps: [
      ['Utility inspection', 'Automated routes for line and structure inspection.'],
      ['Agricultural work', 'Single-rotor spraying and spreading platforms.'],
      ['Cargo', 'Short-haul lifts on helicopter airframes.'],
      ['Research', 'Test platforms that need configurable single-rotor control.'],
    ],
    faq: [
      ['What aircraft does the Finix300 suit?', 'Single-rotor airframes up to 100 kg, including fuel and electric variants.'],
      ['Are the IMUs redundant?', 'Yes — the design uses separate IMU units.'],
      ['Does it support RTK?', 'Yes, RTK modules can be added for higher positioning accuracy.'],
      ['Can missions run autonomously?', 'Yes, one-tap autonomous operation is supported from the app.'],
      ['What is the wind limit?', 'Below 8 m/s.'],
      ['How do I get pricing?', 'Send the airframe type and power system through the quote form for a configuration.'],
    ],
  },
  'Finix3000 Flight Controller': {
    slug: 'finix3000-flight-controller',
    eyebrow: 'PD-Finix3000 · Redundant flight control',
    sub: 'Triple-redundant flight control for airframes from 100 kg to 2,000 kg, with voting logic and RTK.',
    intro: `The Finix3000 is a triple-redundant flight control system for large airframes between 100 kg and 2,000 kg takeoff weight.\n\nA voting architecture resolves sensor disagreement in flight, while a broad interface set supports project-specific payload and actuator integration.`,
    stats: [['Airframe class', '100–2,000', 'kg'], ['Redundancy', 'Triple', ''], ['Max speed', '120', 'km/h'], ['Wind limit', '8', 'm/s']],
    features: [
      ['Triple redundancy', 'Three independent channels with voting logic for fault tolerance.'],
      ['Large airframe support', 'Covers takeoff weights from 100 kg to 2,000 kg.'],
      ['Aviation-grade hardware', 'Components selected for harsh, long-duration operation.'],
      ['Rich interfaces', 'Multiple serial, CAN and IO options for custom payloads and actuators.'],
    ],
    apps: [
      ['Large multirotors', 'Heavy-lift platforms in the 100–2,000 kg class.'],
      ['Industrial BVLOS', 'Long-endurance missions where fault tolerance matters.'],
      ['Cargo', 'Redundant control for payload-carrying aircraft.'],
      ['Special projects', 'Custom airframes with non-standard actuator sets.'],
    ],
    faq: [
      ['What airframe sizes does the Finix3000 support?', 'Takeoff weights from 100 kg to 2,000 kg.'],
      ['How does the redundancy work?', 'Three independent channels feed a voting mechanism that isolates a disagreeing channel.'],
      ['What is the maximum flight speed?', '120 km/h forward.'],
      ['Does it support RTK?', 'Yes — RTK high-precision positioning is supported.'],
      ['Can interfaces be customised?', 'Yes, the platform is offered with project-specific interface configuration.'],
      ['How do I get pricing?', 'Send the airframe class, actuator set and mission profile through the quote form.'],
    ],
  },
  'T1400 Coaxial Unmanned Helicopter': {
    slug: 't1400-coaxial-unmanned-helicopter',
    eyebrow: 'PD-T1400 · Heavy-lift coaxial helicopter',
    sub: 'A 1,400 kg coaxial helicopter with a 6,500 m ceiling and a 200 km operating range.',
    intro: `The T1400 is a large coaxial unmanned helicopter for heavy logistics and high-altitude work, with a 1,400 kg maximum takeoff weight and a 650 kg fuel capacity.\n\nIt cruises at up to 180 km/h with a 200 km range and an endurance of two hours at 500 kg or eight hours at 200 kg.`,
    stats: [['Max takeoff', '1,400', 'kg'], ['Service ceiling', '6,500', 'm'], ['Range', '200', 'km'], ['Max speed', '180', 'km/h']],
    features: [
      ['Heavy-lift capacity', 'A 1,400 kg maximum takeoff weight for cargo and mission equipment.'],
      ['High-altitude operation', '6,500 m service ceiling for plateau transport and survey.'],
      ['Long endurance', 'Two hours at 500 kg and eight hours at 200 kg.'],
      ['Coaxial layout', 'Compact footprint with no tail rotor, suited to confined landing zones.'],
    ],
    apps: [
      ['Heavy logistics', 'Bulk cargo movement where roads are slow or unavailable.'],
      ['Emergency response', 'Large-payload delivery for disaster relief.'],
      ['High-altitude transport', 'Plateau supply runs above 5,000 m.'],
      ['Firefighting support', 'Equipment and supply movement for fire crews.'],
    ],
    faq: [
      ['What is the maximum takeoff weight?', '1,400 kg.'],
      ['How high can it operate?', 'A 6,500 m service ceiling.'],
      ['What is the range?', 'About 200 km, with an endurance of 2 hours at 500 kg or 8 hours at 200 kg.'],
      ['How fast does it fly?', 'Up to 180 km/h in level flight.'],
      ['What fuel capacity does it carry?', '650 kg.'],
      ['How do I get pricing?', 'Send the payload, route and altitude through the quote form for a configuration.'],
    ],
  },
  'TD220 Coaxial Unmanned Helicopter': {
    slug: 'td220-coaxial-unmanned-helicopter',
    eyebrow: 'PD-TD220 · Coaxial unmanned helicopter',
    sub: 'A 350 kg coaxial helicopter with 50 kg payload and up to five hours of endurance.',
    intro: `The TD220 is a compact coaxial unmanned helicopter for inspection, logistics and high-altitude tasks, with a 350 kg maximum takeoff weight and a 50 kg payload.\n\nThree universal hardpoints on the nose and fuselage accept different payloads, and the aerodynamic layout supports up to five hours of flight.`,
    stats: [['Max takeoff', '350', 'kg'], ['Max payload', '50', 'kg'], ['Endurance', '5', 'h'], ['Service ceiling', '3,500', 'm']],
    features: [
      ['Three payload hardpoints', 'Nose and fuselage mounting points accept EO/IR, communications relay, SAR radar and other loads.'],
      ['Five-hour endurance', 'Long loiter times for patrol and relay missions.'],
      ['Compact coaxial layout', 'No tail rotor, so the aircraft fits confined landing areas.'],
      ['High-altitude capability', '3,500 m service ceiling and a 2,500 m hover ceiling out of ground effect.'],
    ],
    apps: [
      ['Inspection', 'Line, pipeline and infrastructure patrols.'],
      ['Communications relay', 'Airborne relay for extended coverage.'],
      ['Search and rescue', 'EO/IR and SAR radar payloads.'],
      ['Short-haul logistics', '50 kg payload transfers to remote sites.'],
    ],
    faq: [
      ['What is the maximum payload?', '50 kg across three universal hardpoints.'],
      ['How long can it stay airborne?', 'Up to five hours depending on payload and fuel.'],
      ['What is the service ceiling?', '3,500 m, with a 2,500 m hover ceiling out of ground effect.'],
      ['What is the maximum speed?', '100 km/h in level flight.'],
      ['What is the range?', 'About 100 km.'],
      ['How do I get pricing?', 'Send the payload and mission profile through the quote form for a configuration.'],
    ],
  },
  'Unihangar S1 Automated Dock': {
    slug: 'unihangar-s1-automated-dock',
    eyebrow: 'PD-Unihangar S1 · Automated dock',
    sub: 'An IP54 automated dock that stores, charges and dispatches a drone without an operator on site.',
    intro: `The Unihangar S1 is an outdoor dock for automated drone operations, combining storage, charging and environmental monitoring in one enclosure.\n\nIt integrates weather and video monitoring with proximity sensors, so the aircraft can be dispatched and recovered remotely as conditions change.`,
    stats: [['Ingress protection', 'IP54', ''], ['Working power', '300', 'W'], ['Closed size', '2.3 × 2.3 × 2', 'm'], ['Open size', '4 × 2.3 × 2', 'm']],
    features: [
      ['Automatic charging', 'The aircraft charges between missions without being removed from the dock.'],
      ['Weather monitoring', 'Wind, temperature and other sensors inform dispatch decisions.'],
      ['Remote supervision', 'Integrated video monitoring for remote equipment checks.'],
      ['Multi-platform support', 'The dock can be configured for different aircraft types.'],
    ],
    apps: [
      ['Remote inspection', 'Unattended patrols of substations and industrial sites.'],
      ['Perimeter security', 'Scheduled flights from a fixed dock.'],
      ['Environmental monitoring', 'Routine sampling and survey routes.'],
      ['Extended range', 'Forward-based docks that shorten transit distance.'],
    ],
    faq: [
      ['Does the dock charge the aircraft?', 'Yes — automatic charging is part of the dock workflow.'],
      ['What protection rating does it have?', 'IP54 for outdoor installation.'],
      ['How large is the dock?', '2.3 × 2.3 × 2 m closed, opening to 4 × 2.3 × 2 m.'],
      ['Can it monitor conditions?', 'Yes — wind, temperature, video and proximity sensors are integrated.'],
      ['Which aircraft does it support?', 'The dock can be configured for different platforms; confirm the airframe with our team.'],
      ['How do I get pricing?', 'Send the site, aircraft and mission frequency through the quote form.'],
    ],
  },
  'ZMD10 Multirotor Drone': {
    slug: 'zmd10-multirotor-drone',
    eyebrow: 'PD-ZMD10 · Multirotor platform',
    sub: 'A 10 kg payload multirotor with 65 minutes of endurance and a 5,500 m ceiling.',
    intro: `The ZMD10 is a multirotor platform for inspection and short-haul transport, carrying up to 10 kg for 46 minutes or flying 65 minutes without payload.\n\nOnboard compute supports autonomous takeoff and landing from moving platforms, multi-target inspection and fleet control, with an optional airborne network module for remote operation.`,
    stats: [['Max payload', '10', 'kg'], ['Endurance', '65', 'min'], ['With 5 kg', '46', 'min'], ['Service ceiling', '5,500', 'm']],
    features: [
      ['Autonomous operations', 'Onboard compute handles precision landing, target recognition and fleet dispatch.'],
      ['Airborne networking', 'An optional network module links the aircraft to a cloud platform for remote tasking.'],
      ['Modular payloads', 'Quick-change mounts for inspection, delivery and specialist sensors.'],
      ['High-altitude capability', '5,500 m service ceiling for plateau operations.'],
    ],
    apps: [
      ['Asset inspection', 'Automated routes with target recognition.'],
      ['Short-haul delivery', 'Up to 10 kg between sites.'],
      ['Emergency support', 'Rapid deployment with sensor payloads.'],
      ['Survey', 'Repeatable mapping and monitoring flights.'],
    ],
    faq: [
      ['What is the maximum payload?', '10 kg.'],
      ['How long can it fly?', '65 minutes without payload and 46 minutes with 5 kg.'],
      ['What is the service ceiling?', '5,500 m.'],
      ['Does it need a pilot on site?', 'Missions can be dispatched and monitored remotely through the cloud platform.'],
      ['Can it land on a moving platform?', 'Yes — autonomous takeoff and landing from moving platforms is supported.'],
      ['How do I get pricing?', 'Send the payload and mission profile through the quote form.'],
    ],
  },
  'ZMD30 Multirotor Drone': {
    slug: 'zmd30-multirotor-drone',
    eyebrow: 'PD-ZMD30 · Multirotor platform',
    sub: 'A 30 kg payload multirotor with 56 minutes of endurance and a 5,500 m ceiling.',
    intro: `The ZMD30 carries 30 kg for 20 minutes, or flies 56 minutes without payload, on a platform designed for modular task equipment.\n\nOnboard compute and an optional airborne network module support remote tasking, multi-target inspection and autonomous landing on moving platforms.`,
    stats: [['Max payload', '30', 'kg'], ['Endurance', '56', 'min'], ['With 30 kg', '20', 'min'], ['Service ceiling', '5,500', 'm']],
    features: [
      ['30 kg payload', 'Carries sensors, cargo boxes or rescue equipment on quick-change mounts.'],
      ['Autonomous workflow', 'Remote dispatch, target recognition and precision landing are handled onboard.'],
      ['Airborne networking', 'Cloud connectivity for remote control and data transfer when fitted.'],
      ['Modular installation', 'Tool-free mounts let operators switch payloads between missions.'],
    ],
    apps: [
      ['Logistics', '30 kg transfers to remote or blocked sites.'],
      ['Inspection', 'Automated patrols with imaging payloads.'],
      ['Emergency response', 'Supply drops and situational awareness.'],
      ['Fire and rescue', 'Equipment delivery to crews in the field.'],
    ],
    faq: [
      ['What is the maximum payload?', '30 kg.'],
      ['How long can it fly?', '56 minutes without payload and 20 minutes at 30 kg.'],
      ['What is the service ceiling?', '5,500 m.'],
      ['Can payloads be swapped in the field?', 'Yes — modular mounts allow quick changes without tools.'],
      ['Does it support remote operation?', 'Yes, with the optional airborne network module and cloud platform.'],
      ['How do I get pricing?', 'Send the payload and route through the quote form for a configuration.'],
    ],
  },
  'ZMD60 Multirotor Drone': {
    slug: 'zmd60-multirotor-drone',
    eyebrow: 'PD-ZMD60 · Multirotor platform',
    sub: 'A 60 kg payload multirotor with 75 minutes of endurance and a 5,500 m ceiling.',
    intro: `The ZMD60 is a heavy-lift multirotor for logistics and emergency work, carrying 60 kg for 31 minutes or flying 75 minutes without payload.\n\nModular quick-release mounts support transport, firefighting and inspection equipment on the same airframe, with onboard compute for autonomous tasking.`,
    stats: [['Max payload', '60', 'kg'], ['Endurance', '75', 'min'], ['With 50 kg', '31', 'min'], ['Service ceiling', '5,500', 'm']],
    features: [
      ['60 kg payload', 'Heavy-lift capacity for cargo, firefighting and rescue modules.'],
      ['Long endurance', '75 minutes without payload and 31 minutes at 50 kg.'],
      ['Modular payload system', 'Knob-lock mounts allow rapid payload changes in the field.'],
      ['Autonomous operation', 'Onboard compute supports remote dispatch and precision landing.'],
    ],
    apps: [
      ['Heavy logistics', '60 kg transfers where ground transport is slow.'],
      ['Firefighting', 'Equipment delivery and aerial support.'],
      ['Emergency response', 'Supplies and sensors for incident scenes.'],
      ['Industrial inspection', 'Long-endurance routes with imaging payloads.'],
    ],
    faq: [
      ['What is the maximum payload?', '60 kg.'],
      ['How long can it fly?', '75 minutes without payload and 31 minutes at 50 kg.'],
      ['What is the service ceiling?', '5,500 m.'],
      ['What payloads can it carry?', 'Transport, firefighting and inspection modules share the same quick-release mounts.'],
      ['Is it autonomous?', 'Yes — onboard compute supports autonomous tasking and precision landing.'],
      ['How do I get pricing?', 'Send the payload and operating profile through the quote form.'],
    ],
  },
};

const products = await runSQL(`select id, supplier_id, name, name_en, model, category, specifications, description
  from public.products where ${TARGET_SQL} order by supplier_id, model`);

const NOTES_BASE = [
  ['*', 'Check, confirm and strictly comply with local laws and regulations before flying.'],
  ['**', 'All images and video were captured in compliance with applicable local regulations. Confirm the aircraft has the required permits before flight.'],
  ['***', 'Product appearance is subject to the shipped unit. Payload figures are measured at sea level unless stated otherwise.'],
];

function buildGeneric(p) {
  const specs = normSpecs(p.specifications);
  const headline = p.name_en || p.name;
  const top = specs.slice(0, 4).map((s) => [s.label, s.value, s.unit || '']);
  return {
    slug: headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    eyebrow: `PD-${(p.model || headline.split(' ')[0]).toString()} · ${p.category.replace('-', ' ')}`,
    sub: `${headline} — configuration, specifications and support from Partdro.`,
    intro: `The ${headline} is supplied and configured by Partdro for ${p.category.replace('-', ' ')} missions.\n\nSpecifications below are compiled from published manufacturer data and confirmed with the factory before shipment.`,
    stats: top.length ? top : [['Platform', 'Configured', 'to order']],
    features: [
      ['Configuration to mission', 'Payload, power and ground equipment are specified around the operating profile.'],
      ['Documented specifications', 'Every unit ships with the published specification set and configuration record.'],
      ['Regional support', 'Delivery, certification documentation and after-sales planning are handled by Partdro.'],
      ['Factory options', 'Optional modules and accessories are quoted with the platform.'],
    ],
    apps: [
      ['Inspection', 'Routine inspection of assets and infrastructure.'],
      ['Logistics', 'Short-haul transport of equipment and supplies.'],
      ['Emergency response', 'Rapid deployment for incident support.'],
      ['Survey', 'Aerial data collection and mapping.'],
    ],
    faq: [
      ['What is included with the aircraft?', 'The standard kit, configured payload and documentation are confirmed in the quotation.'],
      ['Can the configuration be changed?', 'Yes — payload, power and ground equipment are specified per order.'],
      [`What are the key specifications of the ${p.model || headline}?`, specs.slice(0, 3).map((s) => `${s.label}: ${s.value}${s.unit ? ' ' + s.unit : ''}`).join('; ') + '.'],
      ['How is support handled?', 'Partdro provides regional delivery, documentation and after-sales planning.'],
      ['How long is lead time?', 'Lead time depends on configuration and region; it is confirmed with the quotation.'],
      ['How do I request pricing?', 'Send the mission profile and region through the quote form; our team replies with a tailored offer.'],
    ],
  };
}

const CATEGORY_APPS = {};

for (const p of products) {
  const media = await runSQL(`select id, role, sort_order from public.media_assets
    where product_id=${sqlQuote(p.id)} and kind='image' and is_public order by
    case role when 'hero' then 0 when 'overview' then 1 else 2 end, sort_order`);
  const mediaIds = media.map((m) => m.id);
  const heroId = mediaIds[0] || null;
  const overviewId = mediaIds[1] || mediaIds[0] || null;
  const gallery = mediaIds.slice(2);

  const c = CURATED[p.name_en] || buildGeneric(p);
  const slug = c.slug;
  const specs = normSpecs(p.specifications);

  await runSQL(`delete from public.product_pages where product_id=${sqlQuote(p.id)}`);
  const page = await runSQL(`insert into public.product_pages (product_id, slug, template, status, hero_media_id)
    values (${sqlQuote(p.id)}, ${sqlQuote(slug)}, 'product_v2', 'draft', ${heroId ? sqlQuote(heroId) : 'null'})
    returning id`);
  const pageId = page[0].id;
  await sleep(120);

  await runSQL(`insert into public.product_page_translations
    (page_id, locale, seo_title, seo_description, eyebrow, headline, subheadline, cta_primary, cta_secondary, intro_md)
    values (${sqlQuote(pageId)}, 'en', ${sqlQuote((p.name_en || p.name) + ' | Partdro')},
      ${sqlQuote(c.sub.slice(0, 300))}, ${sqlQuote(c.eyebrow)}, ${sqlQuote(p.name_en || p.name)},
      ${sqlQuote(c.sub)}, 'Request a quote', 'Talk to our team', ${sqlQuote(c.intro)})`);

  // specs
await runSQL(`delete from public.product_specs where product_id=${sqlQuote(p.id)}`);
  const specGroups = specs.map((s, i) => ({ group_key: s.group, position: i }));
  const specValues = specs.map((s, i) => ({ position: i, ...splitLabelValue(s.label, s.value) }));
  if (specGroups.length) {
    await runSQL(`insert into public.product_specs (product_id, group_key, position)
      select ${sqlQuote(p.id)}, x.group_key, x.position
      from jsonb_to_recordset(${jsonSql(specGroups)}) as x(group_key text, position int)`);
    await runSQL(`insert into public.product_spec_values (spec_id, locale, label, value, unit)
      select sp.id, 'en', v.label, v.value, v.unit
      from public.product_specs sp
      join jsonb_to_recordset(${jsonSql(specValues)}) as v(position int, label text, value text, unit text)
        on v.position = sp.position
      where sp.product_id = ${sqlQuote(p.id)}`);
  }

  // sections
  const sections = [];
  const addSection = async (kind, data, mediaId = null) => {
    const r = await runSQL(`insert into public.product_sections (page_id, kind, position, media_id, data)
      values (${sqlQuote(pageId)}, ${sqlQuote(kind)}, ${sections.length}, ${mediaId ? sqlQuote(mediaId) : 'null'}, ${jsonSql(data)})
      returning id`);
    sections.push({ id: r[0].id, kind });
    return r[0].id;
  };

  await addSection('hero', { stats: c.stats.map(([label, value, unit]) => ({ label, value, unit })) }, heroId);
  await addSection('overview', { points: specs.slice(0, 4).map((s) => ({ label: s.label, value: s.value })) }, overviewId);

  let gi = 0;
  for (const [title, body] of c.features.slice(0, 4)) {
    const mid = gallery[gi % Math.max(gallery.length, 1)] || overviewId || heroId;
    const sid = await addSection('feature', { title, body, numbered: false }, mid);
    gi++;
  }

  const appItems = c.apps.map(([title, body], i) => ({
    title, body, media_id: gallery[(gi + i) % Math.max(gallery.length, 1)] || overviewId || heroId
  }));
await addSection('applications', { items: appItems });

  const videoAsset = await runSQL(`select id, kind, public_url from public.media_assets
    where product_id=${sqlQuote(p.id)} and kind in ('video','video_embed') order by sort_order limit 1`);
  if (videoAsset.length) {
    await addSection('video', { url: videoAsset[0].public_url }, videoAsset[0].id);
  }

  await addSection('spec_table', { spec_count: specs.length });
  await addSection('faq', { count: c.faq.length });
  await addSection('quote', { cta: 'Request a quote', note: 'We use these details only to respond to this inquiry.' });
  await addSection('notes', { count: NOTES_BASE.length });

  // section translations
  for (const s of sections) {
    if (s.kind === 'feature') continue;
  }
  // write translations per section kind (single locale)
  const rows = await runSQL(`select id, kind from public.product_sections where page_id=${sqlQuote(pageId)} order by position`);
  const byKind = {};
  for (const r of rows) (byKind[r.kind] = byKind[r.kind] || []).push(r.id);

  if (byKind.hero?.[0]) {
    const hero = await runSQL(`select data from public.product_sections where id=${sqlQuote(byKind.hero[0])}`);
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.hero[0])}, 'en', ${jsonSql({ stats: hero[0].data.stats })})`);
  }
  if (byKind.overview?.[0]) {
    const ov = await runSQL(`select data from public.product_sections where id=${sqlQuote(byKind.overview[0])}`);
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.overview[0])}, 'en', ${jsonSql({ kicker: 'Overview', title: p.name_en || p.name, body: c.intro, points: ov[0].data.points })})`);
  }
  const featureIds = byKind.feature || [];
  for (let i = 0; i < featureIds.length && i < c.features.length; i++) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(featureIds[i])}, 'en', ${jsonSql({ kicker: 'Capability', title: c.features[i][0], body: c.features[i][1] })})`);
  }
  if (byKind.applications?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
values (${sqlQuote(byKind.applications[0])}, 'en', ${jsonSql({ kicker: 'Applications', title: 'Where it works', items: c.apps.map(([title, body], i) => ({ title, body, media_id: appItems[i]?.media_id ?? null })) })})`);
  }
  if (byKind.video?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.video[0])}, 'en', ${jsonSql({ kicker: 'Field demo', title: 'See it in operation', body: 'Product footage supplied by the manufacturer.' })})`);
  }
  if (byKind.spec_table?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.spec_table[0])}, 'en', ${jsonSql({ kicker: 'Specifications', title: (p.name_en || p.name) + ' specifications' })})`);
  }
  if (byKind.faq?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.faq[0])}, 'en', ${jsonSql({ kicker: 'FAQ', title: 'Questions, answered' })})`);
  }
  if (byKind.quote?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.quote[0])}, 'en', ${jsonSql({ kicker: 'Pricing', title: 'Request a quote', body: 'Pricing depends on configuration, region and deployment scale. Tell us what you need and our team will come back with a tailored offer.' })})`);
  }
  if (byKind.notes?.[0]) {
    await runSQL(`insert into public.product_section_translations (section_id, locale, data)
      values (${sqlQuote(byKind.notes[0])}, 'en', ${jsonSql({ notes: NOTES_BASE.map(([marker, body]) => ({ marker, body })) })})`);
  }

  // faqs
  await runSQL(`delete from public.product_faqs where product_id=${sqlQuote(p.id)}`);
  let fpos = 0;
  for (const [q, a] of c.faq) {
    const f = await runSQL(`insert into public.product_faqs (product_id, position) values (${sqlQuote(p.id)}, ${fpos}) returning id`);
    await runSQL(`insert into public.product_faq_langs (faq_id, locale, question, answer)
      values (${sqlQuote(f[0].id)}, 'en', ${sqlQuote(q)}, ${sqlQuote(a)})`);
    fpos++;
  }

  // notes
  await runSQL(`delete from public.product_notes where product_id=${sqlQuote(p.id)}`);
  let npos = 0;
  for (const [marker, body] of NOTES_BASE) {
    const n = await runSQL(`insert into public.product_notes (product_id, marker, position) values (${sqlQuote(p.id)}, ${sqlQuote(marker)}, ${npos}) returning id`);
    await runSQL(`insert into public.product_note_langs (note_id, locale, body) values (${sqlQuote(n[0].id)}, 'en', ${sqlQuote(body)})`);
    npos++;
  }

  console.log(JSON.stringify({ name: p.name_en || p.name, slug, specs: specs.length, images: mediaIds.length, sections: sections.length, faqs: c.faq.length }));
}

const stat = await runSQL(`select status, count(*) n from public.product_pages group by 1`);
console.log('PAGES', JSON.stringify(stat));





