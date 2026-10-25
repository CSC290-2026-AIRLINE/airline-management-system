import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'

export interface ScreeningActor {
  userId: string
  staffId: string
  role: string
}
export abstract class ScreeningClock {
  abstract now(): Date
}
@Injectable()
export class SystemScreeningClock extends ScreeningClock {
  now() {
    return new Date()
  }
}

@Injectable()
export class ScreeningContext {
  constructor(
    private readonly db: DbService,
    private readonly clock: ScreeningClock,
  ) {}
  async run<T>(userId: string, work: (tx: Prisma.TransactionClient, actor: ScreeningActor, now: Date) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const staff = await tx.staff.findFirst({
            where: { user_id: userId, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
            select: { id: true, role: { select: { code: true } } },
          })
          if (!staff || staff.role.code !== 'security') throw new ForbiddenException('A staff account with the security role is required')
          return work(tx, { userId, staffId: staff.id, role: staff.role.code }, this.clock.now())
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code === 'P2002' || code === 'P2034') throw new ConflictException('Decision changed, please reload')
      if (code === 'P2025') throw new NotFoundException('Screening record was not found')
      if (code === 'P2003' || code === 'P2023') throw new BadRequestException('Invalid record reference')
      if (code === 'P1001' || code === 'P1002' || code === 'P2024')
        throw new ServiceUnavailableException('Screening is unavailable; check-in must not continue')
      throw new InternalServerErrorException('The screening operation could not be completed; check-in must not continue')
    }
  }
}

@Injectable()
export class ScreeningAudit {
  async record(
    tx: Prisma.TransactionClient,
    actor: ScreeningActor,
    now: Date,
    action: 'create' | 'view_sensitive',
    entityType: string,
    entityId?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    await tx.audit_log.create({
      data: {
        occurred_at: now,
        actor_type: 'staff',
        actor_id: actor.userId,
        actor_role: actor.role,
        source_feature: '7',
        action,
        entity_type: entityType,
        entity_id: entityId,
        summary: `Screening ${action}`,
        is_sensitive: true,
        ...(metadata ? { after: metadata } : {}),
      },
    })
  }
}
