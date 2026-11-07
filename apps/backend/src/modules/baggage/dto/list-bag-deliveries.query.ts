import { IsIn, IsOptional } from 'class-validator'
import { DELIVERY_STATUSES, type DeliveryStatus } from '../common/bag-delivery.types'

/** Query of `GET /api/staff/bag-deliveries`. */
export class ListBagDeliveriesQuery {
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: DeliveryStatus
}
