/** Preserve passport punctuation while converting supported Latin spelling to ASCII. Never guess a Thai passport spelling. */
export function normalizePassportName(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const latin: Record<string, string> = {
    ß: 'ss',
    ẞ: 'SS',
    æ: 'ae',
    Æ: 'AE',
    œ: 'oe',
    Œ: 'OE',
    ø: 'o',
    Ø: 'O',
    ł: 'l',
    Ł: 'L',
    đ: 'd',
    Đ: 'D',
    ð: 'd',
    Ð: 'D',
    þ: 'th',
    Þ: 'TH',
  }
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßẞæÆœŒøØłŁđĐðÐþÞ]/g, (letter) => latin[letter])
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ')
}

/** Same identity comparison key as the database name_key(first_name, last_name). */
export function nameKey(firstName: string, lastName: string): string {
  return `${firstName}${lastName}`.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function normalizePassportNumber(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() || null : value
}
