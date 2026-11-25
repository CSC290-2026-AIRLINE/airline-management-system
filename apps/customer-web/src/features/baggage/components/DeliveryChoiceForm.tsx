import { useId, useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Field } from '@customer-web/components/ui/field'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@customer-web/components/ui/radio-group'
import { Textarea } from '@customer-web/components/ui/textarea'

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

  const pickupId = `${id}-pickup-airport`
  const addressId = `${id}-delivery-address`

  return (
    <Card aria-labelledby={`${id}-title`} role="region">
      <CardHeader>
        <CardTitle id={`${id}-title`} className="text-lg">
          Where should we send it?
        </CardTitle>
        <CardDescription>
          {locked ? 'Your bag is already on its way, so the choice is locked.' : 'You can change this until the bag is sent.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!onSaveChoice && !locked && (
          <Alert role="status">
            <AlertDescription>
              Saving is unavailable until the passenger delivery service is connected. Nothing entered here will be saved.
            </AlertDescription>
          </Alert>
        )}

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <RadioGroup
            value={values.deliveryType}
            onValueChange={(value) => updateValues({ ...values, deliveryType: value as DeliveryType })}
            disabled={isDisabled}
            aria-labelledby={`${id}-title`}
            className="grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {DELIVERY_OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`${id}-${option.value}`}
                className="cursor-pointer items-start gap-3 rounded-md border p-3 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{option.description}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          {!locked &&
            (values.deliveryType === 'airport_pickup' ? (
              <Field id={pickupId} label={addressLabel} error={errors.pickupAirport} hint="Use the three-letter airport code, such as YYZ.">
                <Input
                  id={pickupId}
                  name="pickupAirport"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={3}
                  placeholder="YYZ"
                  value={values.pickupAirport}
                  disabled={isDisabled}
                  aria-invalid={Boolean(errors.pickupAirport)}
                  aria-describedby={errors.pickupAirport ? `${pickupId}-error` : `${pickupId}-hint`}
                  onChange={(event) => updateValues({ ...values, pickupAirport: event.currentTarget.value.trim().toUpperCase() })}
                  onBlur={() => setErrors(validate(values))}
                />
              </Field>
            ) : (
              <Field id={addressId} label={addressLabel} error={errors.address} hint={`${values.address.trim().length}/500 characters`}>
                <Textarea
                  id={addressId}
                  name="address"
                  autoComplete="street-address"
                  maxLength={500}
                  rows={3}
                  value={values.address}
                  disabled={isDisabled}
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? `${addressId}-error` : `${addressId}-hint`}
                  onChange={(event) => updateValues({ ...values, address: event.currentTarget.value })}
                  onBlur={() => setErrors(validate(values))}
                />
              </Field>
            ))}

          {message && (
            <Alert role="status">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {!locked && (
            <Button type="submit" disabled={isSaving} className="justify-self-start">
              {isSaving ? 'Saving…' : onSaveChoice ? 'Save choice' : 'Check choice'}
            </Button>
          )}
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">The airline pays every delivery cost. You never pay.</CardFooter>
    </Card>
  )
}
