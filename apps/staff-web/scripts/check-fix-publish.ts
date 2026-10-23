/**
 * Throwaway check of the fix-publish flow. Not part of the app.
 * Run: npx tsx apps/staff-web/scripts/check-fix-publish.ts
 */
import { autoAssign, evaluateRules } from '../src/features/crew-rostering/assign-crew/types/crew-engine'
import { MOCK_COMMITTED_PAIRINGS, MOCK_CREW } from '../src/features/crew-rostering/assign-crew/types/mock-data'
import { describeBreak } from '../src/features/crew-rostering/fix-publish/types/break-descriptions'
import { CANDIDATE_POOL } from '../src/features/crew-rostering/fix-publish/types/use-fix-publish'
import type { CrewMember, CrewRole, LegAssignment } from '../src/features/crew-rostering/fix-publish/types/types'

function list(label: string, assignments: readonly LegAssignment[]) {
  const breaks = evaluateRules(assignments)
  console.log(`\n=== ${label} — ${breaks.length} engine break(s)`)
  for (const b of breaks) {
    const d = describeBreak(b, assignments, { pool: CANDIDATE_POOL, withReplacement: true })
    if (!d) {
      console.log(`  ${b.code} — describeBreak returned null`)
      continue
    }
    console.log(`  [${d.position ?? '-'}] ${d.code} (${d.severity}) seat=${d.seatRole ?? '-'}`)
    console.log(`      context: ${d.context}`)
    console.log(`      action : ${d.requiredAction}`)
    console.log(`      pool   : ${d.replacement?.availableLabel ?? 'none'}`)
    for (const c of d.replacement?.candidates ?? []) {
      const fails = c.checks.filter((x) => !x.ok).map((x) => x.label)
      console.log(`        ${c.allowed ? 'OK  ' : 'no  '} ${c.member.name.padEnd(14)} ${fails.join(', ')}`)
    }
  }
  return breaks
}

function seats(a: LegAssignment, role: CrewRole): (CrewMember | null)[] {
  switch (role) {
    case 'captain':
      return [a.captain]
    case 'first_officer':
      return [a.firstOfficer]
    case 'cabin':
      return [...a.cabinCrew, ...Array.from({ length: 4 - a.cabinCrew.length }, () => null)]
    case 'local':
      return [...a.localCrew, null]
    case 'police':
      return [...a.police, ...Array.from({ length: 2 - a.police.length }, () => null)]
  }
}

function swap(all: LegAssignment[], role: CrewRole, legIds: readonly string[], member: CrewMember, replaceId?: string): LegAssignment[] {
  return all.map((a) => {
    if (!legIds.includes(a.leg.flightId)) return a
    if (role === 'captain') return { ...a, captain: member }
    if (role === 'first_officer') return { ...a, firstOfficer: member }
    if (role === 'local') return { ...a, localCrew: [member] }
    const current = seats(a, role)
    const named = replaceId ? current.findIndex((s) => s?.id === replaceId) : -1
    const free = current.findIndex((s) => s === null)
    const next = [...current]
    next[named !== -1 ? named : Math.max(free, 0)] = member
    const filled = next.filter((s) => s !== null) as CrewMember[]
    return role === 'cabin' ? { ...a, cabinCrew: filled } : { ...a, police: filled }
  })
}

const pool = (id: string) => CANDIDATE_POOL.find((m) => m.id === id)!

let assignments = autoAssign(MOCK_COMMITTED_PAIRINGS, MOCK_CREW)
console.log(
  'roster:',
  assignments
    .map(
      (a) =>
        `${a.leg.flightNumber}[${a.pairingId}] cap=${a.captain?.name ?? '-'} police=${a.police.map((p) => p.name).join('/') || '-'} local=${a.localCrew.map((l) => l.name).join('/') || '-'}`,
    )
    .join('\n        '),
)

list('STEP 1: as auto-assigned', assignments)

// Fix in mockup order: police on FD210, local crew on FD511, then the rest break on P-102.
assignments = swap(assignments, 'police', ['FL-210'], pool('POOL-01'))
list('STEP 2: T. Wongsa onto FD210', assignments)

assignments = swap(assignments, 'local', ['FL-511'], pool('POOL-07'))
list('STEP 3: J. Park onto FD511', assignments)

assignments = swap(assignments, 'captain', ['FL-511', 'FL-512'], pool('POOL-05'))
list('STEP 4: P. Thongdee onto P-102', assignments)

// The two remaining rest breaks are the police who fly P-101's return leg straight
// into P-102. Both come off the pairing; a rest fix rewrites every leg of it.
// Ids, not names: MOCK_CREW has a C. Boonma and a W. Rattana in cabin crew *and* in
// police, so a name lookup finds the wrong one.
assignments = swap(assignments, 'police', ['FL-511', 'FL-512'], pool('POOL-01'), 'CREW-10')
assignments = swap(assignments, 'police', ['FL-511', 'FL-512'], pool('POOL-02'), 'CREW-11')
list('STEP 5: police swapped off the P-101→P-102 chain', assignments)

console.log('\nFINAL ROSTER')
for (const a of assignments) {
  console.log(
    `  ${a.leg.flightNumber} ${a.pairingId} cap=${a.captain?.name ?? '-'} fo=${a.firstOfficer?.name ?? '-'} cabin=${a.cabinCrew.length} local=${a.localCrew.map((l) => l.name).join('/') || '-'} police=${a.police.map((p) => p.name).join('/') || '-'}`,
  )
}
console.log(`\ncanPublish = ${evaluateRules(assignments).length === 0}`)
