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
const bookingLabels: Record<ServiceCode, string> = {
  WCHR: 'ramp, can climb stairs',
  WCHS: 'steps need help',
  WCHC: 'carried to seat',
  UMNR: 'unaccompanied minor (5–11)',
  MEDA: 'medical assistance',
}

export function AssistanceFields({ value, onChange, disabled = false, popupContainer, bookingMode = false }: AssistanceFieldsProps) {
  const selectedCodes = value.serviceCodes ?? (value.serviceCode ? [value.serviceCode] : [])
  const noteRequired = selectedCodes.some((code) => code === 'UMNR' || code === 'MEDA')
  const codeId = useId()

  return (
    <fieldset className="assistance-fields" disabled={disabled}>
      <legend>Special assistance (optional)</legend>
      {bookingMode ? (
        <div className="assistance-fields__checks" aria-label="Assistance types">
          {options.map(({ code }) => (
            <label className="assistance-fields__check" key={code}>
              <input
                type="checkbox"
                checked={selectedCodes.includes(code)}
                onChange={(event) => {
                  const serviceCodes = event.target.checked ? [...selectedCodes, code] : selectedCodes.filter((item) => item !== code)
                  onChange({ ...value, serviceCode: serviceCodes[0] ?? null, serviceCodes })
                }}
              />
              <span>
                {code} - {bookingLabels[code]}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <>
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
        </>
      )}
      {(bookingMode || value.serviceCode) && (
        <label>
          {bookingMode
            ? 'Note for the airport team (required for UMNR and MEDA)'
            : `Note for the airport team ${noteRequired ? '(required)' : '(optional)'}`}
          <textarea
            value={value.note}
            required={noteRequired}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            placeholder={
              bookingMode
                ? 'e.g. uses a folding wheelchair'
                : noteRequired
                  ? 'Describe the assistance needed and include relevant contact details'
                  : 'Anything the airport team should know'
            }
          />
        </label>
      )}
      <p>
        Wheelchair requests need at least 24 hours before departure. UMNR and MEDA need at least 48 hours. Staff review each request; you
        will be told the outcome.
      </p>
      {selectedCodes.includes('UMNR') && <p>Include the guardian’s contact details in the note.</p>}
    </fieldset>
  )
}
