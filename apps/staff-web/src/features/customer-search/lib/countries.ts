import { nationalityWithCode } from './format'

/**
 * Country options for the "Correct identity" nationality dropdown.
 *
 * `passenger.nationality` is a free-text column holding a short country code
 * ("short country code, validated by the backend" — `schema.sql`), and the API
 * accepts only `^[a-z]{2}$`: `nationality must be a two-letter country code in
 * lower case`. So the stored value is an ISO 3166-1 alpha-2 code in **lower
 * case**, and that is what each option here carries as its value.
 *
 * Labels come from the feature's own `nationalityWithCode`, which keeps the
 * demonyms the design already uses (`Thai`, `Myanmar`) and falls back to
 * `Intl.DisplayNames` for everything else. Reusing it rather than formatting
 * here is what stops the dropdown and the dialog's "Now:" column disagreeing.
 *
 * The design's original dropdown offered a free-text "Other…". It is still
 * absent, and now provably so: every value the API can store is a two-letter
 * country code, and all of them are listed below. An "Other…" option would
 * have nothing left to express.
 */

/** Every assigned ISO 3166-1 alpha-2 code. Kept as one block so it is easy to audit against the standard. */
const ISO_3166_1_ALPHA_2 = `
ad ae af ag ai al am ao aq ar as at au aw ax az
ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz
ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz
de dj dk dm do dz
ec ee eg eh er es et
fi fj fk fm fo fr
ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy
hk hm hn hr ht hu
id ie il im in io iq ir is it
je jm jo jp
ke kg kh ki km kn kp kr kw ky kz
la lb lc li lk lr ls lt lu lv ly
ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz
na nc ne nf ng ni nl no np nr nu nz
om
pa pe pf pg ph pk pl pm pn pr ps pt pw py
qa
re ro rs ru rw
sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz
tc td tf tg th tj tk tl tm tn to tr tt tv tw tz
ua ug um us uy uz
va vc ve vg vi vn vu
wf ws
ye yt
za zm zw`
  .trim()
  .split(/\s+/)

export interface CountryOption {
  /** The two-letter lower-case code sent to the API and stored in the column. */
  value: string
  /** `Thailand (th)` — display name plus the code that would be stored. */
  label: string
}

/** Every country, alphabetically by display name so the list reads like a country list rather than a code list. */
export const COUNTRY_OPTIONS: ReadonlyArray<CountryOption> = ISO_3166_1_ALPHA_2.map((code) => ({
  value: code,
  label: nationalityWithCode(code),
})).sort((a, b) => a.label.localeCompare(b.label, 'en'))
