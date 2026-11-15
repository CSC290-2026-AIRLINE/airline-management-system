// Same 249 alpha-2 codes as the installed @faker-js/faker dataset used by backend seed.ts.
// Kept local so the frontend does not bundle the backend's fixture library.
export const nationalityCodes =
  `ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw tw`.split(
    ' ',
  )

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const thaiRegionNames = new Intl.DisplayNames(['th'], { type: 'region' })
const nationalityNames: Record<string, string> = {
  th: 'Thai',
  mm: 'Myanmar',
  sg: 'Singaporean',
  jp: 'Japanese',
  cn: 'Chinese',
  gb: 'British',
  us: 'American',
  in: 'Indian',
  my: 'Malaysian',
}

export const isNationalityCode = (value: string) => nationalityCodes.includes(value)
export const nationalityName = (code: string) => (code ? (nationalityNames[code] ?? regionNames.of(code.toUpperCase()) ?? code) : '—')
export const nationalityLabel = (code: string) => (code ? `${nationalityName(code)} (${code})` : 'Select nationality')

export const nationalityOptions = nationalityCodes
  .map((value) => ({
    value,
    label: nationalityLabel(value),
    search: `${nationalityLabel(value)} ${regionNames.of(value.toUpperCase())} ${thaiRegionNames.of(value.toUpperCase())}`.toLowerCase(),
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'))
