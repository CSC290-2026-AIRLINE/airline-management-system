import type { Passenger, Profile } from './profile-context'

export interface IdentityResponse {
  id: string
  firstName: string
  lastName: string
  localFirstName: string | null
  localLastName: string | null
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
}
export interface ProfileResponse extends Omit<IdentityResponse, 'id'> {
  id: string | null
  needsIdentitySetup: boolean
  passportNumber: string | null
  email: string
  phone: string | null
  profilePhotoUrl: string | null
}
export interface PassengerResponse extends IdentityResponse {
  relationship: string | null
  passportNumber: string | null
}
const commonNationalities = [
  ['th', 'Thai'],
  ['us', 'American'],
  ['au', 'Australian'],
  ['gb', 'British'],
  ['ca', 'Canadian'],
  ['cn', 'Chinese'],
  ['ph', 'Filipino'],
  ['fr', 'French'],
  ['de', 'German'],
  ['in', 'Indian'],
  ['id', 'Indonesian'],
  ['it', 'Italian'],
  ['jp', 'Japanese'],
  ['la', 'Lao'],
  ['my', 'Malaysian'],
  ['mm', 'Myanmar'],
  ['nz', 'New Zealander'],
  ['sg', 'Singaporean'],
  ['kr', 'South Korean'],
  ['vn', 'Vietnamese'],
]
const countryCodes =
  'ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw'.split(
    ' ',
  )
const regions = new Intl.DisplayNames(['en'], { type: 'region' })
export function countryName(code: string) {
  return regions.of(code.toUpperCase()) ?? code.toUpperCase()
}
// People search by country name, not by demonym, and some names moved on recently (Türkiye, Czechia). Keep the
// spellings and abbreviations people actually type next to the official name so the picker still finds them.
const nationalityAliases: Record<string, string[]> = {
  gb: ['uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  us: ['usa', 'united states', 'united states of america', 'america'],
  ae: ['uae', 'emirates'],
  nl: ['holland'],
  ci: ['ivory coast', 'cote divoire'],
  cd: ['dr congo', 'democratic republic of the congo', 'drc'],
  tr: ['turkey'],
  cz: ['czech republic'],
  mm: ['burma'],
  va: ['holy see', 'vatican'],
  sz: ['swaziland'],
  tl: ['east timor'],
  cv: ['cape verde'],
  mk: ['macedonia'],
  kr: ['republic of korea'],
  tw: ['chinese taipei', 'taiwan'],
}
/** [ISO 3166-1 alpha-2 code, nationality label, country name] */
export const nationalityOptions = [
  ...commonNationalities,
  ...countryCodes.filter((code) => !commonNationalities.some(([value]) => value === code)).map((code) => [code, countryName(code)]),
]
  .map(([code, label]) => [code, label, countryName(code)])
  .sort((left, right) => left[1].localeCompare(right[1]))
/** Everything the nationality picker should match a typed query against. */
export function nationalitySearchText(option: string[]) {
  const [code, label, country] = option
  return [label, country, code, ...(nationalityAliases[code] ?? [])].join(' ').toLowerCase()
}
export const genderCodes: Record<string, string> = { Male: 'M', Female: 'F', 'Other / unspecified': 'X' }
export function nationalityLabel(code: string | null) {
  if (!code) return ''
  return nationalityOptions.find(([key]) => key === code.toLowerCase())?.[1] ?? countryName(code)
}
export function nationalityCode(label: string) {
  return nationalityOptions.find(([, name]) => name === label)?.[0] ?? label.toLowerCase()
}
function identityView(value: Omit<IdentityResponse, 'id'>) {
  return {
    firstName: value.firstName,
    lastName: value.lastName,
    dateOfBirth: value.dateOfBirth ?? '',
    gender: Object.keys(genderCodes).find((label) => genderCodes[label] === value.gender) ?? '',
    nationality: nationalityLabel(value.nationality),
  }
}
export function profileView(value: ProfileResponse): Profile {
  return {
    needsIdentitySetup: value.needsIdentitySetup ?? (!value.dateOfBirth || !value.gender || !value.nationality),
    ...identityView(value),
    localFirstName: value.localFirstName ?? '',
    localLastName: value.localLastName ?? '',
    passportNumber: value.passportNumber ?? '',
    email: value.email,
    phone: value.phone ?? '',
    photo: value.profilePhotoUrl,
  }
}
export function passengerView(value: PassengerResponse): Passenger {
  const local = [value.localFirstName, value.localLastName].filter(Boolean).join(' ')
  const relationship = value.relationship ?? 'other'
  return {
    ...identityView(value),
    id: value.id,
    name: `${value.firstName} ${value.lastName}${local ? ` · ${local}` : ''}`,
    localFirstName: value.localFirstName ?? '',
    localLastName: value.localLastName ?? '',
    passportNumber: value.passportNumber ?? '',
    nationalityCode: value.nationality ?? '',
    relationship: relationship.charAt(0).toUpperCase() + relationship.slice(1),
  }
}
export function passengerBody(passenger: Passenger, editing: boolean) {
  return {
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    localFirstName: passenger.localFirstName || null,
    localLastName: passenger.localLastName || null,
    passportNumber: passenger.passportNumber || null,
    relationship: passenger.relationship.toLowerCase(),
    ...(!editing
      ? {
          dateOfBirth: passenger.dateOfBirth,
          gender: genderCodes[passenger.gender],
          nationality: passenger.nationalityCode || nationalityCode(passenger.nationality),
        }
      : {}),
  }
}
export function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    const first: unknown = error.errors[0]
    if (first && typeof first === 'object') {
      if ('longMessage' in first && typeof first.longMessage === 'string') return first.longMessage
      if ('message' in first && typeof first.message === 'string') return first.message
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

// Feature-scoped transport; authentication and token refresh stay in the existing AuthProvider.
export async function profileRequest<T>(
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithAuth(`/api/passenger-profiles${path}`, init)
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const message = data && typeof data === 'object' && 'message' in data ? data.message : null
    throw new Error(
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.join('. ')
          : `Unable to save or load your profile (${response.status}).`,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
