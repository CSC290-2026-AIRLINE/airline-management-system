import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import type {
  CreateSavedPassengerDto,
  ProfileUpdateDto,
  SavedPassengerQueryDto,
  UpdateSavedPassengerDto,
} from './dto/passenger-profiles.dto'
import { ProfileResponseDto, SavedPassengerResponseDto } from './dto/passenger-profiles-response.dto'
import type { IdentitySetupDto } from './dto/identity-setup.dto'

const passengerSelect = {
  id: true,
  first_name: true,
  last_name: true,
  local_first_name: true,
  local_last_name: true,
  date_of_birth: true,
  gender: true,
  nationality: true,
  passport_number: true,
} satisfies Prisma.passengerSelect
const customerSelect = {
  id: true,
  phone: true,
  profile_photo_url: true,
  user: { select: { email: true } },
  passenger: { select: passengerSelect },
} satisfies Prisma.customerSelect
const savedSelect = { id: true, relationship_type: true, passenger: { select: passengerSelect } } satisfies Prisma.customer_passengerSelect

type Customer = Prisma.customerGetPayload<{ select: typeof customerSelect }>
type Identity = Prisma.passengerGetPayload<{ select: typeof passengerSelect }>
type SavedPassenger = Prisma.customer_passengerGetPayload<{ select: typeof savedSelect }>
type Database = Pick<DbService, 'customer' | 'passenger' | 'customer_passenger'>

function identityView(passenger: Identity) {
  return {
    firstName: passenger.first_name,
    lastName: passenger.last_name,
    localFirstName: passenger.local_first_name,
    localLastName: passenger.local_last_name,
    dateOfBirth: passenger.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: passenger.gender,
    nationality: passenger.nationality,
  }
}
function profileView(customer: Customer) {
  return plainToInstance(
    ProfileResponseDto,
    {
      id: customer.id,
      needsIdentitySetup:
        !/^[A-Za-z][A-Za-z .'-]*$/.test(customer.passenger.first_name) ||
        !/^[A-Za-z][A-Za-z .'-]*$/.test(customer.passenger.last_name) ||
        !customer.passenger.date_of_birth ||
        !customer.passenger.gender ||
        !customer.passenger.nationality,
      ...identityView(customer.passenger),
      email: customer.user.email,
      passportNumber: customer.passenger.passport_number,
      phone: customer.phone,
      profilePhotoUrl: customer.profile_photo_url,
    },
    { excludeExtraneousValues: true },
  )
}
function savedView(saved: SavedPassenger) {
  return plainToInstance(
    SavedPassengerResponseDto,
    {
      id: saved.passenger.id,
      ...identityView(saved.passenger),
      relationship: saved.relationship_type,
      passportNumber: saved.passenger.passport_number,
    },
    { excludeExtraneousValues: true },
  )
}
function namesData(body: { firstName?: string; lastName?: string; localFirstName?: string | null; localLastName?: string | null }) {
  return {
    ...(body.firstName !== undefined ? { first_name: body.firstName } : {}),
    ...(body.lastName !== undefined ? { last_name: body.lastName } : {}),
    ...(body.localFirstName !== undefined ? { local_first_name: body.localFirstName } : {}),
    ...(body.localLastName !== undefined ? { local_last_name: body.localLastName } : {}),
  }
}

@Injectable()
export class PassengerProfilesService {
  private readonly logger = new Logger(PassengerProfilesService.name)
  constructor(private readonly db: DbService) {}

  private async customerFor(db: Database, userId: string) {
    const customer = await db.customer.findFirst({
      where: {
        user_id: userId,
        deleted_at: null,
        user: { type: 'customer', deleted_at: null, disabled_at: null },
        passenger: { deleted_at: null },
      },
      select: customerSelect,
    })
    if (!customer) throw new ForbiddenException('An active customer account is required')
    return customer
  }

  private async savedFor(db: Database, customerId: string, passengerId: string) {
    const saved = await db.customer_passenger.findFirst({
      where: {
        customer_id: customerId,
        passenger_id: passengerId,
        is_saved: true,
        passenger: { deleted_at: null },
      },
      select: savedSelect,
    })
    if (!saved) throw new NotFoundException('Saved passenger not found')
    return saved
  }

  private async databaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code === 'P2002') throw new ConflictException('This record already exists')
      if (code === 'P2025') throw new NotFoundException('Record not found')
      if (code === 'P2003' || code === 'P2034') throw new ConflictException('The record changed; reload and try again')
      this.logger.error('Passenger profile database operation failed')
      throw new InternalServerErrorException('Unable to process passenger profile data')
    }
  }

  private async auditSensitiveRead(
    db: Pick<DbService, 'audit_log'>,
    userId: string,
    entityType: 'customer' | 'passenger' | 'user',
    ids: string[],
  ) {
    if (!ids.length) return
    const occurredAt = new Date()
    await db.audit_log.createMany({
      data: ids.map((id) => ({
        occurred_at: occurredAt,
        actor_type: 'customer',
        actor_id: userId,
        source_feature: '7',
        action: 'view_sensitive',
        entity_type: entityType,
        entity_id: id,
        is_sensitive: true,
      })),
    })
  }

  getProfile(userId: string) {
    return this.databaseOperation(async () => {
      let customer: Customer
      try {
        customer = await this.customerFor(this.db, userId)
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error
        const pending = await this.db.user.findFirst({
          where: { id: userId, type: 'customer', deleted_at: null, disabled_at: null, customer: { none: {} } },
          select: { email: true },
        })
        if (!pending) throw error
        await this.auditSensitiveRead(this.db, userId, 'user', [userId])
        return plainToInstance(
          ProfileResponseDto,
          {
            id: null,
            needsIdentitySetup: true,
            firstName: '',
            lastName: '',
            email: pending.email,
            localFirstName: null,
            localLastName: null,
            passportNumber: null,
            phone: null,
            dateOfBirth: null,
            gender: null,
            nationality: null,
            profilePhotoUrl: null,
          },
          { excludeExtraneousValues: true },
        )
      }
      await this.auditSensitiveRead(this.db, userId, 'customer', [customer.id])
      return profileView(customer)
    })
  }

  updateProfile(userId: string, body: ProfileUpdateDto) {
    if (!Object.values(body).some((value) => value !== undefined)) throw new BadRequestException('Provide at least one profile field')
    if (body.dateOfBirth !== undefined || body.gender !== undefined || body.nationality !== undefined)
      throw new BadRequestException('Complete identity through the first sign-in setup')
    return this.databaseOperation(() =>
      this.db.$transaction(
        async (tx) => {
          const customer = await this.customerFor(tx, userId)
          const current = identityView(customer.passenger)
          for (const key of ['dateOfBirth', 'gender', 'nationality'] as const) {
            if (body[key] !== undefined && current[key] !== null && body[key] !== current[key]) {
              throw new ConflictException(`${key} is locked; contact support for a correction`)
            }
          }
          // Match the previously-read identity values so a concurrent request cannot overwrite setup.
          const identityWrite = await tx.passenger.updateMany({
            where: {
              id: customer.passenger.id,
              deleted_at: null,
              date_of_birth: customer.passenger.date_of_birth,
              gender: customer.passenger.gender,
              nationality: customer.passenger.nationality,
            },
            data: {
              ...namesData(body),
              ...(body.passportNumber !== undefined ? { passport_number: body.passportNumber } : {}),
              ...(body.dateOfBirth !== undefined ? { date_of_birth: new Date(`${body.dateOfBirth}T00:00:00.000Z`) } : {}),
              ...(body.gender !== undefined ? { gender: body.gender } : {}),
              ...(body.nationality !== undefined ? { nationality: body.nationality } : {}),
              updated_at: new Date(),
            },
          })
          if (identityWrite.count !== 1) throw new ConflictException('Profile changed; reload and try again')
          const accountWrite = await tx.customer.updateMany({
            where: { id: customer.id, deleted_at: null },
            data: {
              ...(body.phone !== undefined ? { phone: body.phone } : {}),
              ...(body.profilePhotoUrl !== undefined ? { profile_photo_url: body.profilePhotoUrl } : {}),
              updated_at: new Date(),
            },
          })
          if (accountWrite.count !== 1) throw new ConflictException('Profile changed; reload and try again')
          const updated = await this.customerFor(tx, userId)
          await this.auditSensitiveRead(tx, userId, 'customer', [customer.id])
          return profileView(updated)
        },
        { isolationLevel: 'Serializable' },
      ),
    )
  }

  completeIdentitySetup(userId: string, body: IdentitySetupDto) {
    return this.databaseOperation(() =>
      this.db.$transaction(
        async (tx) => {
          const owner = await tx.user.findFirst({
            where: { id: userId, type: 'customer', disabled_at: null, deleted_at: null },
            select: { id: true, customer: { select: { id: true, deleted_at: true } } },
          })
          if (!owner || owner.customer.some((item) => item.deleted_at))
            throw new ForbiddenException('An active customer account is required')
          if (!owner.customer.length) {
            const passenger = await tx.passenger.create({
              data: {
                first_name: body.firstName,
                last_name: body.lastName,
                date_of_birth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
                gender: body.gender,
                nationality: body.nationality,
              },
              select: { id: true },
            })
            await tx.customer.create({ data: { user_id: userId, passenger_id: passenger.id } })
          } else {
            const current = await this.customerFor(tx, userId)
            if (!profileView(current).needsIdentitySetup)
              throw new ConflictException('Identity setup is already complete; contact support for corrections')
            const values = identityView(current.passenger)
            for (const key of ['dateOfBirth', 'gender', 'nationality'] as const) {
              if (values[key] !== null && values[key] !== body[key])
                throw new ConflictException(`${key} is locked; contact support for a correction`)
            }
            const written = await tx.passenger.updateMany({
              where: {
                id: current.passenger.id,
                deleted_at: null,
                date_of_birth: current.passenger.date_of_birth,
                gender: current.passenger.gender,
                nationality: current.passenger.nationality,
              },
              data: {
                first_name: body.firstName,
                last_name: body.lastName,
                date_of_birth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
                gender: body.gender,
                nationality: body.nationality,
                updated_at: new Date(),
              },
            })
            if (written.count !== 1) throw new ConflictException('Identity setup changed; reload and try again')
          }
          const customer = await this.customerFor(tx, userId)
          await this.auditSensitiveRead(tx, userId, 'customer', [customer.id])
          return profileView(customer)
        },
        { isolationLevel: 'Serializable' },
      ),
    )
  }

  listPassengers(userId: string, query: SavedPassengerQueryDto) {
    return this.databaseOperation(async () => {
      const customer = await this.customerFor(this.db, userId)
      const limit = query.limit ?? 50
      const where = { customer_id: customer.id, is_saved: true, passenger: { deleted_at: null } }
      if (query.cursor) {
        const cursor = await this.db.customer_passenger.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })
        if (!cursor) throw new NotFoundException('Saved passenger cursor not found')
      }
      const results = await this.db.customer_passenger.findMany({
        where,
        select: savedSelect,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      })
      const page = results.slice(0, limit)
      await this.auditSensitiveRead(
        this.db,
        userId,
        'passenger',
        page.map((saved) => saved.passenger.id),
      )
      return { items: page.map(savedView), nextCursor: results.length > limit ? results[limit - 1].id : null }
    })
  }

  createPassenger(userId: string, body: CreateSavedPassengerDto) {
    return this.databaseOperation(() =>
      this.db.$transaction(
        async (tx) => {
          const customer = await this.customerFor(tx, userId)
          // A new identity row belongs to this customer's booking context; do not deduplicate across accounts.
          const passenger = await tx.passenger.create({
            data: {
              first_name: body.firstName,
              last_name: body.lastName,
              local_first_name: body.localFirstName,
              local_last_name: body.localLastName,
              date_of_birth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
              gender: body.gender,
              nationality: body.nationality,
              passport_number: body.passportNumber,
            },
            select: { id: true },
          })
          const saved = await tx.customer_passenger.create({
            data: {
              customer_id: customer.id,
              passenger_id: passenger.id,
              relationship_type: body.relationship,
              is_saved: true,
            },
            select: savedSelect,
          })
          await this.auditSensitiveRead(tx, userId, 'passenger', [saved.passenger.id])
          return savedView(saved)
        },
        { isolationLevel: 'Serializable' },
      ),
    )
  }

  updatePassenger(userId: string, passengerId: string, body: UpdateSavedPassengerDto) {
    if (!Object.values(body).some((value) => value !== undefined)) throw new BadRequestException('Provide at least one passenger field')
    return this.databaseOperation(() =>
      this.db.$transaction(
        async (tx) => {
          const customer = await this.customerFor(tx, userId)
          await this.savedFor(tx, customer.id, passengerId)
          // Do not allow a customer to edit an account holder or an identity shared with another customer.
          const identityWrite = await tx.passenger.updateMany({
            where: {
              id: passengerId,
              deleted_at: null,
              customer: null,
              customer_passenger: { every: { customer_id: customer.id } },
            },
            data: {
              ...namesData(body),
              ...(body.passportNumber !== undefined ? { passport_number: body.passportNumber } : {}),
              updated_at: new Date(),
            },
          })
          if (identityWrite.count !== 1) throw new ConflictException('This saved identity cannot be edited from your account')
          const linkWrite = await tx.customer_passenger.updateMany({
            where: {
              customer_id: customer.id,
              passenger_id: passengerId,
              is_saved: true,
            },
            data: { ...(body.relationship !== undefined ? { relationship_type: body.relationship } : {}), updated_at: new Date() },
          })
          if (linkWrite.count !== 1) throw new ConflictException('Saved passenger changed; reload and try again')
          const updated = await this.savedFor(tx, customer.id, passengerId)
          await this.auditSensitiveRead(tx, userId, 'passenger', [passengerId])
          return savedView(updated)
        },
        { isolationLevel: 'Serializable' },
      ),
    )
  }

  removePassenger(userId: string, passengerId: string) {
    return this.databaseOperation(async () => {
      const customer = await this.customerFor(this.db, userId)
      const result = await this.db.customer_passenger.updateMany({
        where: {
          customer_id: customer.id,
          passenger_id: passengerId,
          is_saved: true,
          passenger: { deleted_at: null },
        },
        data: { is_saved: false, updated_at: new Date() },
      })
      if (!result.count) throw new NotFoundException('Saved passenger not found')
    })
  }
}
