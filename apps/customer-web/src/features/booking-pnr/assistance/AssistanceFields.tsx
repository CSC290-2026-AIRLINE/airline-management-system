import type { ServiceCode } from '../api/types'
import type { AssistanceFieldsProps } from '../components/contracts'
import './assistance-fields.css'

const options: Array<{ code: ServiceCode; label: string }> = [
  { code: 'WCHR', label: 'Wheelchair: assistance on the ramp' },
  { code: 'WCHS', label: 'Wheelchair: assistance with steps' },
  { code: 'WCHC', label: 'Wheelchair: assistance to the seat' },
  { code: 'UMNR', label: 'Unaccompanied minor (ages 5–11)' },
  { code: 'MEDA', label: 'Medical assistance' },
]

export function AssistanceFields({ value, onChange, disabled = false }: AssistanceFieldsProps) {
  const noteRequired = value.serviceCode === 'UMNR' || value.serviceCode === 'MEDA'

  return (
    <fieldset className="assistance-fields" disabled={disabled}>
      <legend>Special assistance (optional)</legend>
      <label>
        Assistance type
        <select
          value={value.serviceCode ?? ''}
          onChange={(event) => onChange({ ...value, serviceCode: (event.target.value || null) as ServiceCode | null })}
        >
          <option value="">No assistance requested</option>
          {options.map(({ code, label }) => (
            <option key={code} value={code}>
              {code} — {label}
            </option>
          ))}
        </select>
      </label>
      {value.serviceCode && (
        <label>
          Note for the airport team {noteRequired ? '(required)' : '(optional)'}
          <textarea value={value.note} required={noteRequired} onChange={(event) => onChange({ ...value, note: event.target.value })} />
        </label>
      )}
      <p>
        Wheelchair requests need at least 24 hours before departure. Unaccompanied minor and medical requests need at least 48 hours. Staff
        review each request.
      </p>
      {value.serviceCode === 'UMNR' && <p>Include the guardian’s contact details in the note.</p>}
    </fieldset>
  )
}
