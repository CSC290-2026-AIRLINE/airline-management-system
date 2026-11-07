import { Equals, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import {
  COLLECTORS,
  DELIVERY_TYPES,
  ID_DOCUMENT_TYPES,
  STAFF_DELIVERY_STATUSES,
  type Collector,
  type DeliveryType,
  type IdDocumentType,
  type StaffDeliveryStatus,
} from '../common/bag-delivery.types'

/** Body of `PUT /api/staff/bag-deliveries/:id/choice`: the passenger's choice, taken by the desk. */
export class RecordDeliveryChoiceDto {
  @IsIn(DELIVERY_TYPES)
  deliveryType: DeliveryType

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'pickupAirport must be a 3-letter IATA code' })
  pickupAirport?: string
}

/** Body of `POST /api/staff/bag-deliveries/:id/status`. */
export class SetDeliveryStatusDto {
  @IsIn(STAFF_DELIVERY_STATUSES)
  status: StaffDeliveryStatus

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string
}

/** Body of `POST /api/staff/bag-deliveries/:id/hand-over`: what the person collecting the bag shows. */
export class HandOverBagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  bookingReference: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string

  @IsIn(COLLECTORS)
  collector: Collector

  @IsOptional()
  @IsString()
  @MaxLength(100)
  representativeName?: string

  @IsIn(ID_DOCUMENT_TYPES)
  documentType: IdDocumentType

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documentNumber: string

  /** Staff confirm the photo and name on the document belong to the person collecting the bag. */
  @Equals(true, { message: 'Check the photo and name on the document first' })
  documentChecked: boolean

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}
