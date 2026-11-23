/**
 * Phone numbers typed at the desk, with the same form rules as the backend's common/phone-number.ts: international form
 * only, + and the country code first. The backend also checks that the number fits its country's numbering plan and
 * answers with what to fix, which the forms show like their own errors.
 */

/** Country calling codes (ITU E.164) and the main country of each, from the libphonenumber metadata. */
const CALLING_CODES = new Map(
  (
    '1:US 7:RU 20:EG 27:ZA 30:GR 31:NL 32:BE 33:FR 34:ES 36:HU 39:IT 40:RO 41:CH 43:AT 44:GB 45:DK 46:SE 47:NO 48:PL ' +
    '49:DE 51:PE 52:MX 53:CU 54:AR 55:BR 56:CL 57:CO 58:VE 60:MY 61:AU 62:ID 63:PH 64:NZ 65:SG 66:TH 81:JP 82:KR 84:VN ' +
    '86:CN 90:TR 91:IN 92:PK 93:AF 94:LK 95:MM 98:IR 211:SS 212:MA 213:DZ 216:TN 218:LY 220:GM 221:SN 222:MR 223:ML ' +
    '224:GN 225:CI 226:BF 227:NE 228:TG 229:BJ 230:MU 231:LR 232:SL 233:GH 234:NG 235:TD 236:CF 237:CM 238:CV 239:ST ' +
    '240:GQ 241:GA 242:CG 243:CD 244:AO 245:GW 246:IO 247:AC 248:SC 249:SD 250:RW 251:ET 252:SO 253:DJ 254:KE 255:TZ ' +
    '256:UG 257:BI 258:MZ 260:ZM 261:MG 262:RE 263:ZW 264:NA 265:MW 266:LS 267:BW 268:SZ 269:KM 290:SH 291:ER 297:AW ' +
    '298:FO 299:GL 350:GI 351:PT 352:LU 353:IE 354:IS 355:AL 356:MT 357:CY 358:FI 359:BG 370:LT 371:LV 372:EE 373:MD ' +
    '374:AM 375:BY 376:AD 377:MC 378:SM 380:UA 381:RS 382:ME 383:XK 385:HR 386:SI 387:BA 389:MK 420:CZ 421:SK 423:LI ' +
    '500:FK 501:BZ 502:GT 503:SV 504:HN 505:NI 506:CR 507:PA 508:PM 509:HT 590:GP 591:BO 592:GY 593:EC 594:GF 595:PY ' +
    '596:MQ 597:SR 598:UY 599:CW 670:TL 672:NF 673:BN 674:NR 675:PG 676:TO 677:SB 678:VU 679:FJ 680:PW 681:WF 682:CK ' +
    '683:NU 685:WS 686:KI 687:NC 688:TV 689:PF 690:TK 691:FM 692:MH 850:KP 852:HK 853:MO 855:KH 856:LA 880:BD 886:TW ' +
    '960:MV 961:LB 962:JO 963:SY 964:IQ 965:KW 966:SA 967:YE 968:OM 970:PS 971:AE 972:IL 973:BH 974:QA 975:BT 976:MN ' +
    '977:NP 992:TJ 993:TM 994:AZ 995:GE 996:KG 998:UZ'
  )
    .trim()
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
)

/** Thai numbers after +66: mobiles are 9 digits starting 6, 8 or 9; landlines are 8 digits starting 2, 3, 4, 5 or 7. */
const THAI_MOBILE = /^[689]\d{8}$/
const THAI_LANDLINE = /^[2-57]\d{7}$/
const INTERNATIONAL = /^\+ ?\d[\d ]*$/

/** The country calling code a number starts with (1 to 3 digits, none is a prefix of another), or null. */
function callingCode(digits: string): string | null {
  for (const length of [1, 2, 3]) {
    const code = digits.slice(0, length)
    if (CALLING_CODES.has(code)) return code
  }
  return null
}

/**
 * Turn what the desk typed into one stored form, or null when it is not an international phone number: + and the
 * country code, then digits and spaces, 8 to 15 digits in all (E.164). Thai numbers are grouped the way they are read
 * out ("+66 2 134 0000", "+66 81 234 5678"); other countries keep the spacing that was typed after the country code.
 */
export function formatPhoneNumber(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, ' ') ?? ''
  if (!INTERNATIONAL.test(value)) return null

  const digits = value.replace(/\D/g, '')
  const code = callingCode(digits)
  if (!code || digits.length < 8 || digits.length > 15) return null

  if (code === '66') {
    // "+66 0 81 …" is a common way to write a Thai number; the 0 is dropped after the country code.
    const national = digits.slice(2).replace(/^0/, '')
    if (THAI_MOBILE.test(national)) return `+66 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`
    if (THAI_LANDLINE.test(national)) {
      // Bangkok numbers have a 1-digit area code (2); the other provinces have 2 digits.
      return national.startsWith('2')
        ? `+66 2 ${national.slice(1, 4)} ${national.slice(4)}`
        : `+66 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`
    }
    // Not a Thai mobile or landline: kept as typed, and refused like any other number that does not fit its country.
  }

  // Skip the country code's digits (and any spaces typed inside it), keep the rest as typed.
  let rest = value.slice(1)
  for (let seen = 0; seen < code.length; rest = rest.slice(1)) {
    if (/\d/.test(rest[0])) seen++
  }
  return `+${code} ${rest.trim()}`
}

/** Why the text is not a phone number, said so the desk can fix it; null when it is one. */
export function phoneNumberProblem(raw: string): string | null {
  if (formatPhoneNumber(raw)) return null

  const value = raw.trim().replace(/\s+/g, ' ')
  const digits = value.replace(/\D/g, '')

  if (!value) return 'Enter the phone number.'
  if (!value.startsWith('+')) return 'Start with + and the country code, for example +66 81 234 5678.'
  if (!INTERNATIONAL.test(value)) return 'Use only digits and spaces after the +.'
  const code = callingCode(digits)
  if (!code) return 'The number after + is not a country code.'
  return `This is not a valid phone number for country code +${code}. Check the digits after it.`
}

/** A stored phone for display: tidied when it is a phone number, shown as it is otherwise (older records). */
export function displayPhone(phone: string): string {
  return formatPhoneNumber(phone) ?? phone
}

/** `tel:` link target: the + and digits only. */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}
