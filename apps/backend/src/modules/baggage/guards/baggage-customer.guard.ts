import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'

export interface BaggageCustomer extends AuthenticatedUser {
  customerId: string
  passengerId: string
}

type BaggageCustomerRequest = Request & {
  user?: AuthenticatedUser
  baggageCustomer?: BaggageCustomer
}

@Injectable()
export class BaggageCustomerGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BaggageCustomerRequest>()

    const user = request.user

    if (!user) {
      throw new UnauthorizedException()
    }

    const customer = await this.db.customer.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: {
          type: 'customer',
          disabled_at: null,
          deleted_at: null,
        },
      },
      select: {
        id: true,
        passenger_id: true,
      },
    })

    if (!customer) {
      throw new ForbiddenException('Customer account required')
    }

    request.baggageCustomer = {
      ...user,
      customerId: customer.id,
      passengerId: customer.passenger_id,
    }

    return true
  }
}

export const CurrentBaggageCustomer = createParamDecorator((_: unknown, context: ExecutionContext): BaggageCustomer => {
  const request = context.switchToHttp().getRequest<BaggageCustomerRequest>()

  return request.baggageCustomer!
})
