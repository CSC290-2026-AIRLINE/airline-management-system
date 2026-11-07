import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import type { FoundBag, RecordFoundBagBody } from '../api/found-bags'
import { BAG_COLOURS, BAG_TYPES, BAG_TYPE_LABELS, BAGGAGE_TAG_PATTERN, colourLabel, type BagColour, type BagType } from '../constants'
import { errorMessage, type Airport } from '../hooks/useFoundBags'
import { F10Card, FIELD_BOX, Field, FormError, SelectBox } from './primitives'

const TYPE_OPTIONS = BAG_TYPES.map((t) => ({ value: t, label: BAG_TYPE_LABELS[t] }))
const COLOUR_OPTIONS = BAG_COLOURS.map((c) => ({ value: c, label: colourLabel(c) }))

/** "Card / Record a found bag" */
export function RecordFoundBagCard({
  airports,
  onRecord,
}: {
  airports: Airport[]
  onRecord: (body: RecordFoundBagBody) => Promise<FoundBag>
}) {
  const [foundAirport, setFoundAirport] = useState('')
  const [bagType, setBagType] = useState<BagType>('suitcase')
  const [colour, setColour] = useState<BagColour>('black')
  const [tagNumber, setTagNumber] = useState('')
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)

  const airport = foundAirport || airports[0]?.code || ''

  function checkTag(value: string): boolean {
    const ok = value.trim() === '' || BAGGAGE_TAG_PATTERN.test(value.trim())
    setTagError(ok ? null : 'Use 10 digits: 0, then 789, then 6 digits.')
    return ok
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!checkTag(tagNumber) || !airport) return
    setSaving(true)
    setError(null)
    try {
      await onRecord({
        foundAirport: airport,
        bagType,
        colour,
        tagNumber: tagNumber.trim() || undefined,
        brand: brand.trim() || undefined,
        description: description.trim() || undefined,
      })
      setTagNumber('')
      setBrand('')
      setDescription('')
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <F10Card aria-labelledby="record-found-bag">
      <h2 id="record-found-bag" className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d]">
        Record a found bag
      </h2>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 max-md:flex-col">
            <Field label="Found at" htmlFor="fb-found-at">
              <SelectBox
                id="fb-found-at"
                value={airport}
                onValueChange={setFoundAirport}
                options={airports.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))}
              />
            </Field>
            <Field label="Bag type" htmlFor="fb-type">
              <SelectBox id="fb-type" value={bagType} onValueChange={(v) => setBagType(v as BagType)} options={TYPE_OPTIONS} />
            </Field>
            <Field label="Colour" htmlFor="fb-colour">
              <SelectBox id="fb-colour" value={colour} onValueChange={(v) => setColour(v as BagColour)} options={COLOUR_OPTIONS} />
            </Field>
          </div>
          <div className="flex gap-3 max-md:flex-col">
            <Field label="Tag number" htmlFor="fb-tag">
              <Input
                id="fb-tag"
                inputMode="numeric"
                maxLength={10}
                placeholder="Blank if no tag"
                value={tagNumber}
                onChange={(e) => setTagNumber(e.target.value)}
                onBlur={(e) => checkTag(e.target.value)}
                aria-invalid={tagError ? true : undefined}
                aria-describedby={tagError ? 'fb-tag-error' : undefined}
                className={FIELD_BOX}
              />
              {tagError && (
                <span id="fb-tag-error" className="text-xs text-danger">
                  {tagError}
                </span>
              )}
            </Field>
            <Field label="Brand" htmlFor="fb-brand">
              <Input
                id="fb-brand"
                maxLength={100}
                placeholder="e.g. Samsonite"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={FIELD_BOX}
              />
            </Field>
            <Field label="Came off flight" htmlFor="fb-flight">
              {/* No flight lookup API yet, so the only choice is the Figma default. */}
              <SelectBox
                id="fb-flight"
                value="unknown"
                onValueChange={() => undefined}
                options={[{ value: 'unknown', label: 'Not known' }]}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="fb-description">
            <Input
              id="fb-description"
              maxLength={1000}
              placeholder="Marks, stickers, condition"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={FIELD_BOX}
            />
          </Field>
        </div>
        <FormError message={error} />
        <div className="flex items-center gap-3 max-md:flex-col max-md:items-stretch">
          <p className="flex-1 text-xs text-[#677287]">Tag numbers: 0, the airline code 789, then 6 digits (Feature 6).</p>
          <Button
            type="submit"
            disabled={saving || !airport}
            className="h-auto rounded-lg bg-[#fca311] px-5 py-3 text-sm leading-normal font-semibold text-[#14213d] hover:bg-[#fca311]/90"
          >
            {saving ? 'Saving…' : 'Save and run matching'}
          </Button>
        </div>
      </form>
    </F10Card>
  )
}
