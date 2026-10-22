import type { Comparison, HistoryRow, ScreeningRecord } from './types'

const comparisons = (
  name: string,
  entry: string,
  dob: string,
  entryDob: string,
  passport: string,
  entryPassport: string,
  nationality = 'Thai (th)',
  entryNationality = nationality,
  gender = 'M · Male',
): Comparison[] => [
  ['Name', name, entry],
  ['Date of birth', dob, entryDob],
  ['Nationality', nationality, entryNationality],
  ['Passport', `•••• ${passport}`, entryPassport === 'Not on entry' ? entryPassport : `•••• ${entryPassport}`],
  ['Gender', gender, gender],
]

// Display snapshots from Figma. Typed check/review data uses Iteration-03 semantics.
// One simulation day: 05 Nov 2026, 08:30 in Asia/Bangkok; reload restores the fixtures.
type Fixture = Omit<ScreeningRecord, 'runId' | 'passengerId' | 'watchlistEntryId' | 'matchReason'>

const fixtures: Fixture[] = [
  {
    id: 'C-F731',
    name: 'SOMSAK JAIDEE',
    displayName: 'Somsak Jaidee',
    triggerPoint: 'check_in',
    outcome: 'held',
    match: 'Probable',
    flight: { id: 'FD641-2026-11-05', label: 'FD 641 · BKK → NRT', departureAt: '2026-11-05T10:40:00+07:00' },

    occurredAt: '2026-11-05T08:12:00+07:00',

    similarity: '0.92',
    comparison: comparisons('SOMSAK JAIDEE', 'SOMSAK JAIDEE', '02 Jul 1985', '02 Jul 1985', '4821', '9037'),
    booking: 'ABC123',
    bookedBy: 'Somsak Jaidee (own account)',
    others: '1 (checked in)',
    listType: 'Wanted',
    reason: 'Demo case 2026-014',
    listed: '14 Mar 2026',
    history: [
      ['01 Nov 14:05', 'Booking', 'Probable', 'Flagged', 'No review yet'],
      ['Today 08:12', 'Check-in', 'Probable', 'Held', 'This check'],
    ],
    reviews: [],
  },
  {
    id: 'C-F735',
    name: 'ARTHIT WONGSA',
    displayName: 'Arthit Wongsa',
    triggerPoint: 'check_in',
    outcome: 'held',
    match: 'Strong',
    flight: { id: 'FD212-2026-11-05', label: 'FD 212 · BKK → SIN', departureAt: '2026-11-05T14:20:00+07:00' },

    occurredAt: '2026-11-05T08:25:00+07:00',

    similarity: '1.00',
    comparison: comparisons('ARTHIT WONGSA', 'ARTHIT WONGSA', '19 Feb 1979', '19 Feb 1979', '6630', '6630'),
    booking: 'QW7T2M',
    bookedBy: 'Travel desk (staff booking)',
    others: '2 (checked in)',
    listType: 'Wanted',
    reason: 'Demo case 2026-009',
    listed: '03 Feb 2026',
    history: [
      ['28 Oct 09:15', 'Booking', 'Strong', 'Flagged', 'No review yet'],
      ['Today 08:25', 'Check-in', 'Strong', 'Held', 'This check'],
    ],
    reviews: [],
  },
  {
    id: 'C-F702',
    name: 'MAYA KORNSIRI',
    displayName: 'Maya Kornsiri',
    triggerPoint: 'booking',
    outcome: 'flagged',
    match: 'Weak',
    flight: { id: 'FD330-2026-11-05', label: 'FD 330 · BKK → RGN', departureAt: '2026-11-05T16:05:00+07:00' },

    occurredAt: '2026-11-02T10:20:00+07:00',

    similarity: '0.64',
    comparison: comparisons(
      'MAYA KORNSIRI',
      'MAYA KORN',
      '30 Apr 1991',
      '30 Apr 1990',
      '7712',
      '5520',
      'Myanmar (mm)',
      'Myanmar (mm)',
      'F · Female',
    ),
    booking: 'K9PL4R',
    bookedBy: 'Maya Kornsiri (own account)',
    others: 'None',
    listType: 'No-fly',
    reason: 'Demo case 2026-021',
    listed: '21 Jan 2026',
    history: [['02 Nov 10:20', 'Booking', 'Weak', 'Flagged', 'This check']],
    reviews: [],
  },
  ...decidedFixtures(),
]

function decidedFixtures(): Fixture[] {
  const rows = [
    {
      id: 'C-F719',
      name: 'KANYA THONG',
      displayName: 'Kanya Thong',
      match: 'Probable' as const,
      flight: { id: 'FD118-2026-11-05', label: 'FD 118 · BKK → HKG', departureAt: '2026-11-05T09:10:00+07:00' },

      occurredAt: '2026-11-05T07:31:00+07:00',
      similarity: '0.94',
      comparison: comparisons(
        'KANYA THONG',
        'KANYA THONG',
        '11 Mar 1990',
        '11 Mar 1990',
        '2290',
        '7781',
        'Thai (th)',
        'Thai (th)',
        'F · Female',
      ),
      booking: 'HK4R2D',
      others: 'None',
      listType: 'Travel ban',
      reason: 'Demo case 2026-031',
      listed: '02 Jun 2026',
      at: '07:52',
      note: 'Passport at the counter has a different number from the entry and the photo doesn’t match. Not the same person.',
      history: [
        ['04 Nov 10:30', 'Booking', 'Probable', 'Flagged', 'No review'],
        ['Today 07:31', 'Check-in', 'Probable', 'Held', 'This check'],
      ] as HistoryRow[],
    },
    {
      id: 'C-F722',
      name: 'NATTAPON CHAI',
      displayName: 'Nattapon Chai',
      match: 'Probable' as const,
      flight: { id: 'FD641-2026-11-05', label: 'FD 641 · BKK → NRT', departureAt: '2026-11-05T10:40:00+07:00' },

      occurredAt: '2026-11-05T07:18:00+07:00',
      similarity: '0.81',
      comparison: comparisons('NATTAPON CHAI', 'NATTAPON CHAIYA', '27 May 1983', '27 May 1983', '6105', '4473'),
      booking: 'ZT9K1P',
      others: '1 (checked in)',
      listType: 'Wanted',
      reason: 'Demo case 2026-027',
      listed: '19 Apr 2026',
      at: '07:40',
      note: 'Same DOB, but the surname spelling and passport number differ. Checked the passport in person.',
      history: [['Today 07:18', 'Check-in', 'Probable', 'Held', 'This check']] as HistoryRow[],
    },
    {
      id: 'C-F716',
      name: 'PREECHA SUKSAN',
      displayName: 'Preecha Suksan',
      match: 'Strong' as const,
      flight: { id: 'FD402-2026-11-05', label: 'FD 402 · BKK → ICN', departureAt: '2026-11-05T09:50:00+07:00' },

      occurredAt: '2026-11-05T06:58:00+07:00',
      similarity: '1.00',
      comparison: comparisons('PREECHA SUKSAN', 'PREECHA SUKSAN', '08 Dec 1976', '08 Dec 1976', '5518', '5518'),
      booking: 'RM3V8S',
      others: 'None',
      listType: 'Wanted',
      reason: 'Demo case 2026-004',
      listed: '11 Jan 2026',
      at: '07:20',
      note: 'Passport number and nationality match the entry; photo matches at the counter. Authority notified.',
      history: [
        ['30 Oct 16:44', 'Booking', 'Strong', 'Flagged', 'No review'],
        ['Today 06:58', 'Check-in', 'Strong', 'Held', 'This check'],
      ] as HistoryRow[],
    },
    {
      id: 'C-F709',
      name: 'LEE MIN',
      displayName: 'Lee Min',
      match: 'Weak' as const,
      flight: { id: 'FD212-2026-11-05', label: 'FD 212 · BKK → SIN', departureAt: '2026-11-05T14:20:00+07:00' },

      occurredAt: '2026-11-05T06:30:00+07:00',
      similarity: '0.67',
      comparison: comparisons(
        'LEE MIN',
        'LEE MING',
        '23 Aug 1988',
        '04 Jan 1975',
        '0412',
        'Not on entry',
        'Singapore (sg)',
        'Malaysia (my)',
      ),
      booking: 'SG2L6W',
      others: 'None',
      listType: 'No-fly',
      reason: 'Demo case 2026-038',
      listed: 'Today 06:25',
      at: '06:48',
      note: 'Only the name is similar; date of birth and nationality are different.',
      history: [['Today 06:30', 'New entry', 'Weak', 'Flagged', 'This check']] as HistoryRow[],
    },
    {
      id: 'C-F701',
      name: 'ARUN DEE',
      displayName: 'Arun Dee',
      match: 'Weak' as const,
      flight: { id: 'FD330-2026-11-15', label: 'FD 330 · BKK → RGN', departureAt: '2026-11-15T07:30:00+07:00' },

      occurredAt: '2026-11-03T11:05:00+07:00',
      similarity: '0.62',
      comparison: comparisons('ARUN DEE', 'ARUN DEEPAK', '09 Sep 1992', '30 Dec 1984', '3344', '8120', 'Thai (th)', 'Myanmar (mm)'),
      booking: 'RG7D3A',
      others: 'None',
      listType: 'Wanted',
      reason: 'Demo case 2026-012',
      listed: '09 Feb 2026',
      at: '06:15',
      note: 'Different DOB, nationality and passport. Flag cleared.',
      history: [['03 Nov 11:05', 'Booking', 'Weak', 'Flagged', 'This check']] as HistoryRow[],
    },
  ]
  return rows.map((row, index) => {
    const decision = index === 2 ? ('confirmed' as const) : ('false_positive' as const)
    const reviewedAt = `2026-11-05T${row.at}:00+07:00`
    const by = index < 3 ? 'Nida P.' : 'Ton W.'
    return {
      ...row,
      outcome: index < 3 ? 'held' : 'flagged',
      triggerPoint: index < 3 ? 'check_in' : index === 3 ? 'new_entry' : 'booking',

      bookedBy: `${row.displayName} (own account)`,
      history: row.history,
      reviews: [
        {
          id: `R-${row.id}-1`,
          decision,
          by,
          reviewedAt,
          note: row.note,
          passportCompared: true,
          ...(decision === 'confirmed' ? { authorityNotifiedAt: reviewedAt } : {}),
        },
      ],
    }
  })
}

export const screeningFixtures: ScreeningRecord[] = fixtures.map((record) => ({
  ...record,
  runId: `RUN-${record.id}`,
  passengerId: `P-${record.id}`,
  watchlistEntryId: `W-${record.id}`,
  matchReason: record.match === 'Strong' ? 'passport_and_nationality' : record.match === 'Probable' ? 'name_and_dob' : 'similar_name',
}))
