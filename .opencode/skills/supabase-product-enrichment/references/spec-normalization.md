# Specification normalization

Goal: every spec is `label` (English) + `value` + `unit`, grouped and ordered.

## Label dictionary (extend as needed)

| Chinese | English | Group |
|---|---|---|
| 最大起飞重量 / 起飞重量 | Max takeoff weight | performance |
| 最大载荷 / 最大载重 / 额定载重 / 最大有效载荷 | Max payload | performance |
| 最大水平飞行速度 / 最大平飞速度 / 最大飞行速度 | Max speed | performance |
| 巡航速度 | Cruise speed | performance |
| 最大上升速度 / 最大下降速度 | Max climb / descent rate | performance |
| 实用升限 / 最大飞行海拔高度 | Service ceiling | performance |
| 最大飞行高度 | Max flight height | performance |
| 无地效悬停高度 | Hover ceiling (OGE) | performance |
| 典型任务半径 / 最大飞行半径 | Mission radius | performance |
| 续航时间 / 最大续航 / 滞空时间 | Endurance | performance |
| 抗风能力 / 抗风等级 | Wind resistance | environment |
| 工作温度 | Operating temperature | environment |
| 防护等级 | Ingress protection | environment |
| 定位精度 / RTK定位精度 / 悬停精度 | Positioning accuracy | navigation |
| 轴距 | Wheelbase | dimensions |
| 外形尺寸 / 展开尺寸 / 收纳尺寸 | Dimensions | dimensions |
| 翼展 / 机身长度 | Wingspan / Fuselage length | dimensions |
| 重量 | Weight | dimensions |
| 电压范围 / 工作电压 / 输入电压 / 输出电压 | Voltage | power |
| 输出功率 / 最大功耗 | Power | power |
| 系缆长度 / 收放拉力 / 收放线速度 | Tether length / tension / speed | power |
| 光通量 / 中心照度 / 照明功率 / 灯组亮度 | Luminous flux / Illuminance / Lighting power | payload |
| 照明面积 / 最大照明范围 | Illuminated area | payload |
| 部署时间 | Deployment time | operations |
| 云台 / 接口 / 任务载荷设备 | Gimbal / Interfaces / Payload device | payload |

## Reject keys

`电话|地址|热线|服务时间|市场合作|技术支持|周一到周|里程碑|Milestone|咨询|邮箱|网址|微信|QQ|邮编`
and any key longer than 32 characters that is not in the dictionary.

Reject values that are phone numbers, emails, dates, or navigation text.

## Value cleanup

- Replace Chinese phrases inside values:
  `海平面→sea level`, `播撒→spreading`, `喷洒→spraying`, `标配→standard`,
  `选配→optional`, `加装→fitted with`, `含油→incl. fuel`, `空载→no payload`,
  `可扩展→expandable`, `大于→more than`, `载荷→payload`, `喷头→nozzles`,
  `作业箱→tank`, `果树套件→orchard kit`, `公斤→kg`
- Insert a space between letters and digits (`folded1.1` → `folded 1.1`).
- Split `"126kg（...）"` into value `126` + unit `kg` only when the remainder is empty;
  otherwise keep the compound text and leave `unit` null.
- Cap at 24 specs, ordered by group: performance → dimensions → environment →
  navigation → power → payload → operations → compatibility → general.

## Multi-configuration values

When one label has several configurations (e.g. spreading vs spraying), keep the
compound value but rewrite it as a short English list. Do not silently pick one number.