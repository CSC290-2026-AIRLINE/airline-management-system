import type { ServiceCode } from '../api/types'
import type { AssistanceFieldsProps } from '../components/contracts'
import { useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import './assistance-fields.css'

const options: Array<{ code: ServiceCode; label: string }> = [
  { code: 'WCHR', label: 'Wheelchair: assistance on the ramp' },
  { code: 'WCHS', label: 'Wheelchair: assistance with steps' },
  { code: 'WCHC', label: 'Wheelchair: assistance to the seat' },
  { code: 'UMNR', label: 'Unaccompanied minor (ages 5–11)' },
  { code: 'MEDA', label: 'Medical assistance' },
]

export function AssistanceFields({ value, onChange, disabled = false, popupContainer }: AssistanceFieldsProps) {
  const noteRequired = value.serviceCode === 'UMNR' || value.serviceCode === 'MEDA'
  const codeId = useId()

  return (
    <fieldset className="assistance-fields" disabled={disabled}>
      <legend>Special assistance (optional)</legend>
      <label htmlFor={codeId}>Assistance type</label>
      <Select
        value={value.serviceCode ?? ''}
        disabled={disabled}
        onValueChange={(code) => onChange({ ...value, serviceCode: (code || null) as ServiceCode | null })}
      >
        <SelectTrigger id={codeId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={popupContainer}>
          <SelectItem value="">No assistance requested</SelectItem>
          {options.map(({ code, label }) => (
            <SelectItem key={code} value={code}>
              {code} — {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.serviceCode && (
        <label>
          Note for the airport team {noteRequired ? '(required)' : '(optional)'}
          <textarea
            value={value.note}
            required={noteRequired}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            placeholder={
              noteRequired ? 'Describe the assistance needed and include relevant contact details' : 'Anything the airport team should know'
            }
          />
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
