import { IdentityFieldsDto } from './identity-fields'

/**
 * Body contract for `POST /api/staff/passengers`.
 *
 * Only `firstName` and `lastName` are required, because they are the only `NOT NULL`
 * columns on `passenger` (see `src/db/prisma/schema.prisma`); every other field the
 * table accepts is optional and recorded as `null` when it was not supplied. The identity
 * fields themselves are inherited from {@link IdentityFieldsDto}.
 *
 * This creates a passenger and nothing else. A `customer` row needs a unique `user_id`
 * and a `passenger_id`, and an account that does not come from a Clerk sign-in could
 * never authenticate, so creating one here is out of scope — see the module README.
 */
export class CreatePassengerDto extends IdentityFieldsDto {}
