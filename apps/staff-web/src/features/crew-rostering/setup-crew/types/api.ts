import { requestJson, requestVoid, type FetchWithAuth } from '../../build-pairings/types/api'
import type { Certification, CertificationInput, CrewMember, CrewProfileInput, CrewRole } from './types'

/**
 * Calls to `/api/crew-rostering/setup-crew`, through `fetchWithAuth` so every request
 * carries the staff access token. No cache: the page hook owns its state until the
 * shared TanStack Query setup lands.
 *
 * The backend names roles by slug (`first_officer`) and also sends the label the page
 * prints (`roleLabel`). The page works in labels, so this file is the only place that
 * translates between the two.
 */

const BASE_PATH = '/api/crew-rostering/setup-crew'

const ROLE_SLUG: Record<CrewRole, string> = {
  Captain: 'captain',
  'First Officer': 'first_officer',
  'Cabin Crew': 'cabin_crew',
  'Flight Police': 'police',
}

/** A crew member as the backend sends it: the page's `CrewMember` with a slug role and its label beside it. */
type CrewPayload = Omit<CrewMember, 'role' | 'justCreated'> & { role: string; roleLabel: CrewRole }

interface OptionPayload {
  code: string
  label: string
}

export interface CrewDirectory {
  crew: CrewMember[]
  /** Days before expiry that a licence or certification shows as expiring soon. */
  expiryWarningDays: number
}

export interface SetupCrewOptions {
  bases: string[]
  fleets: string[]
  languages: OptionPayload[]
}

function toCrewMember(payload: CrewPayload): CrewMember {
  const { roleLabel, ...rest } = payload
  return { ...rest, role: roleLabel }
}

function toProfileBody(input: CrewProfileInput) {
  return { ...input, role: ROLE_SLUG[input.role] }
}

export function createSetupCrewApi(fetchWithAuth: FetchWithAuth) {
  const request = <T>(path: string, init?: RequestInit) => requestJson<T>(fetchWithAuth, `${BASE_PATH}${path}`, init)
  const send = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

  return {
    async listOptions(): Promise<SetupCrewOptions> {
      const [bases, fleets, languages] = await Promise.all([
        request<{ code: string; name: string }[]>('/bases'),
        request<OptionPayload[]>('/fleets'),
        request<OptionPayload[]>('/languages'),
      ])
      return { bases: bases.map((base) => base.code), fleets: fleets.map((fleet) => fleet.code), languages }
    },

    /** The whole roster once; the page filters and counts it locally so the metric cards never move with the filters. */
    async listCrew(): Promise<CrewDirectory> {
      const result = await request<{ crew: CrewPayload[]; expiryWarningDays: number }>('/crew')
      return { crew: result.crew.map(toCrewMember), expiryWarningDays: result.expiryWarningDays }
    },

    async suggestEmployeeNo(): Promise<string> {
      return (await request<{ employeeNo: string }>('/crew/suggest-employee-no')).employeeNo
    },

    async createCrew(input: CrewProfileInput): Promise<CrewMember> {
      return toCrewMember(await request<CrewPayload>('/crew', send('POST', toProfileBody(input))))
    },

    async updateCrew(crewId: string, input: CrewProfileInput): Promise<CrewMember> {
      return toCrewMember(await request<CrewPayload>(`/crew/${crewId}`, send('PATCH', toProfileBody(input))))
    },

    addCertification: (crewId: string, input: CertificationInput) =>
      request<Certification>(`/crew/${crewId}/certifications`, send('POST', input)),

    updateCertification: (crewId: string, certificationId: string, input: CertificationInput) =>
      request<Certification>(`/crew/${crewId}/certifications/${certificationId}`, send('PATCH', input)),

    removeCertification: (crewId: string, certificationId: string) =>
      requestVoid(fetchWithAuth, `${BASE_PATH}/crew/${crewId}/certifications/${certificationId}`, { method: 'DELETE' }),
  }
}
