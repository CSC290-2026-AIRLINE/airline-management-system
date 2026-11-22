import { BadRequestException, ParseUUIDPipe, ValidationPipe } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { registerDecorator, type ValidationArguments, type ValidationError, type ValidationOptions } from 'class-validator'

/**
 * Validation shared by the five crew rostering controllers.
 *
 * Each controller applies `rosteringValidationPipe` with `@UsePipes`, as admin-console does, until the Dev Leads make a
 * pipe global. Unknown fields are stripped rather than refused, because the pages send whole form objects. Messages
 * name the field, and `RosteringExceptionFilter` joins them into the `{ error: { code, message } }` body.
 */
export const rosteringValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  // One message per problem, nested legs and pairings included. A missing field fails both "is a string" and "is not
  // empty" with the same words, which would otherwise read twice.
  exceptionFactory: (errors) => new BadRequestException([...new Set(messagesOf(errors))]),
})

function messagesOf(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [...Object.values(error.constraints ?? {}), ...messagesOf(error.children ?? [])])
}

/** A UUID path parameter. Ids reach Postgres as UUID parameters, so a malformed one is a 400 here rather than a 500 there. */
export function uuidParam(field: string): ParseUUIDPipe {
  return new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException(`${field} must be a UUID`) })
}

/** Trims a string. Anything else is left for the validators to refuse. */
export const Trim = (): PropertyDecorator => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))

/** Trims, then upper-cases a string: IATA and country codes. */
export const TrimUpper = (): PropertyDecorator => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))

/** Trims a string and turns blank, `null` and missing into `null`, for optional text the service stores as NULL. */
export const BlankToNull = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') return value
    return value.trim() === '' ? null : value.trim()
  })

/** Lower-cases each string of an array: language codes. */
export const LowerEach = (): PropertyDecorator =>
  Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : item)) : value,
  )

/**
 * A number sent as a number or a numeric string. Blank stays blank, so `@IsNumber` refuses it rather than `Number('')`
 * quietly making it 0.
 */
export const ToNumber = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value)
    return value
  })

/** A `YYYY-MM-DD` calendar date. Full ISO instants are refused, because the pages only ever send dates. */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: { message: ({ property }: ValidationArguments) => `${property} must be a YYYY-MM-DD date`, ...options },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
      },
    })
  }
}

/** The date is on or after the date in `field` of the same object. Both are `YYYY-MM-DD`, so they compare as text. */
export function IsOnOrAfter(field: string, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOnOrAfter',
      target: target.constructor,
      propertyName: propertyKey as string,
      constraints: [field],
      options: { message: ({ property }: ValidationArguments) => `${property} must be on or after ${field}`, ...options },
      validator: {
        validate: (value: unknown, args: ValidationArguments) => {
          const other = (args.object as Record<string, unknown>)[field]
          return typeof value !== 'string' || typeof other !== 'string' || value >= other
        },
      },
    })
  }
}
