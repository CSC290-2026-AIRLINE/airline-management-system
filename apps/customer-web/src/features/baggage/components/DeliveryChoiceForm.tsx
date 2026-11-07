import { useId, useState, type FormEvent } from 'react'
import './DeliveryChoiceForm.css'

const DELIVERY_OPTIONS = [
  { value: 'home', label: 'Home', description: 'Your home address' },
  { value: 'hotel', label: 'Hotel', description: 'Where you are staying now' },
  { value: 'other_address', label: 'Other address', description: 'Your current destination' },
  { value: 'airport_pickup', label: 'Airport pickup', description: 'Collect it at a baggage desk' },
] as const
type DeliveryType = (typeof DELIVERY_OPTIONS)[number]['value']
type AddressDeliveryType = Exclude<DeliveryType, 'airport_pickup'>

export type PassengerDeliveryChoice =
  { deliveryType: AddressDeliveryType; address: string } | { deliveryType: 'airport_pickup'; pickupAirport: string }

interface DeliveryChoiceFormProps {
  onSaveChoice?: (choice: PassengerDeliveryChoice) => void | Promise<void>
  locked?: boolean
  initialChoice?: PassengerDeliveryChoice
}

interface FormValues {
  deliveryType: DeliveryType
  address: string
  pickupAirport: string
}

type FieldErrors = Partial<Record<'address' | 'pickupAirport', string>>

const ADDRESS_LABELS: Record<AddressDeliveryType, string> = {
  home: 'Home address',
  hotel: 'Hotel name and address',
  other_address: 'Other address',
}

function valuesFromChoice(choice?: PassengerDeliveryChoice): FormValues {
  if (!choice) return { deliveryType: 'home', address: '', pickupAirport: '' }

  return choice.deliveryType === 'airport_pickup'
    ? { deliveryType: choice.deliveryType, address: '', pickupAirport: choice.pickupAirport.trim().toUpperCase() }
    : { deliveryType: choice.deliveryType, address: choice.address, pickupAirport: '' }
}

function validate(values: FormValues): FieldErrors {
  if (values.deliveryType === 'airport_pickup') {
    const airport = values.pickupAirport.trim().toUpperCase()
    return /^[A-Z]{3}$/.test(airport) ? {} : { pickupAirport: 'Enter a valid three-letter airport code.' }
  }

  const address = values.address.trim()
  if (!address) return { address: `Enter the ${ADDRESS_LABELS[values.deliveryType].toLowerCase()}.` }
  if (address.length > 500) return { address: 'Address must be 500 characters or fewer.' }
  return {}
}

export function DeliveryChoiceForm({ onSaveChoice, locked = false, initialChoice }: DeliveryChoiceFormProps) {
  const id = useId()
  const [values, setValues] = useState<FormValues>(() => valuesFromChoice(initialChoice))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [hasAttempted, setHasAttempted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isDisabled = locked || isSaving

  function updateValues(nextValues: FormValues) {
    setValues(nextValues)
    setMessage('')
    if (hasAttempted) setErrors(validate(nextValues))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return

    setHasAttempted(true)

    const nextErrors = validate(values)
    setErrors(nextErrors)
    setMessage('')
    if (Object.keys(nextErrors).length > 0) return

    const choice: PassengerDeliveryChoice =
      values.deliveryType === 'airport_pickup'
        ? { deliveryType: 'airport_pickup', pickupAirport: values.pickupAirport.trim().toUpperCase() }
        : { deliveryType: values.deliveryType, address: values.address.trim() }

    if (!onSaveChoice) {
      setMessage('Your choice is valid, but it has not been saved. Passenger delivery saving is not available yet.')
      return
    }

    setIsSaving(true)
    try {
      await onSaveChoice(choice)
      setMessage('Your delivery choice was saved.')
    } catch {
      setMessage('We could not save your choice. Try again later.')
    } finally {
      setIsSaving(false)
    }
  }

  const addressLabel = values.deliveryType === 'airport_pickup' ? 'Pickup airport code' : ADDRESS_LABELS[values.deliveryType]

  return (
    <section className="delivery-choice" aria-labelledby={`${id}-title`}>
      <header className="delivery-choice__header">
        <h2 id={`${id}-title`}>Where should we send it?</h2>
        <p>{locked ? 'Your bag is already on its way, so the choice is locked.' : 'You can change this until the bag is sent.'}</p>
      </header>

      {!onSaveChoice && !locked && (
        <p className="delivery-choice__notice" role="status">
          Saving is unavailable until the passenger delivery service is connected. Nothing entered here will be saved.
        </p>
      )}

      <form className="delivery-choice__form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <fieldset className="delivery-choice__options" disabled={isDisabled} aria-labelledby={`${id}-title`}>
          <legend className="delivery-choice__sr-only">Delivery method</legend>
          {DELIVERY_OPTIONS.map((option) => (
            <label
              className={`delivery-choice__option${values.deliveryType === option.value ? ' delivery-choice__option--selected' : ''}`}
              key={option.value}
            >
              <input
                type="radio"
                name="deliveryType"
                value={option.value}
                checked={values.deliveryType === option.value}
                onChange={() => updateValues({ ...values, deliveryType: option.value })}
              />
              <span className="delivery-choice__option-copy">
                <span className="delivery-choice__option-title">{option.label}</span>
                <span className="delivery-choice__option-description">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {!locked &&
          (values.deliveryType === 'airport_pickup' ? (
            <label className="delivery-choice__field" htmlFor={`${id}-pickup-airport`}>
              <span>{addressLabel}</span>
              <input
                id={`${id}-pickup-airport`}
                name="pickupAirport"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={3}
                placeholder="YYZ"
                value={values.pickupAirport}
                disabled={isDisabled}
                aria-invalid={Boolean(errors.pickupAirport)}
                aria-describedby={errors.pickupAirport ? `${id}-pickup-airport-error` : `${id}-pickup-airport-hint`}
                onChange={(event) => updateValues({ ...values, pickupAirport: event.currentTarget.value.trim().toUpperCase() })}
                onBlur={() => setErrors(validate(values))}
              />
              {errors.pickupAirport && (
                <span className="delivery-choice__error" id={`${id}-pickup-airport-error`} role="alert">
                  {errors.pickupAirport}
                </span>
              )}
              <span className="delivery-choice__hint" id={`${id}-pickup-airport-hint`}>
                Use the three-letter airport code, such as YYZ.
              </span>
            </label>
          ) : (
            <label className="delivery-choice__field" htmlFor={`${id}-delivery-address`}>
              <span>{addressLabel}</span>
              <textarea
                id={`${id}-delivery-address`}
                name="address"
                autoComplete="street-address"
                maxLength={500}
                rows={3}
                value={values.address}
                disabled={isDisabled}
                aria-invalid={Boolean(errors.address)}
                aria-describedby={errors.address ? `${id}-delivery-address-error` : `${id}-delivery-address-hint`}
                onChange={(event) => updateValues({ ...values, address: event.currentTarget.value })}
                onBlur={() => setErrors(validate(values))}
              />
              {errors.address ? (
                <span className="delivery-choice__error" id={`${id}-delivery-address-error`} role="alert">
                  {errors.address}
                </span>
              ) : (
                <span className="delivery-choice__hint" id={`${id}-delivery-address-hint`}>
                  {values.address.trim().length}/500 characters
                </span>
              )}
            </label>
          ))}

        {message && (
          <p className="delivery-choice__message" role="status">
            {message}
          </p>
        )}
        {!locked && (
          <button className="delivery-choice__submit" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : onSaveChoice ? 'Save choice' : 'Check choice'}
          </button>
        )}
      </form>
      <p className="delivery-choice__cost">The airline pays every delivery cost. You never pay.</p>
    </section>
  )
}
