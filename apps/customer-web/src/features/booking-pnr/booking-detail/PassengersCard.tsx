import type { BookingDetail, BookingServiceRequest } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import controls from '../styles/controls.module.css'
import { FeatureAction } from './FeatureAction'
import { ASSISTANCE_DISABLED, initialOf, passengerRole, serviceRequestChip } from './booking-detail-model'
import styles from './PassengersCard.module.css'

/**
 * The passengers of a booking with their roles, and the assistance requests they made (D8).
 */
export function PassengersCard({ booking }: { booking: BookingDetail }) {
  const requestsByPassenger = new Map<string, BookingServiceRequest[]>()
  for (const request of booking.serviceRequests) {
    const requests = requestsByPassenger.get(request.bookingPassengerId) ?? []
    requests.push(request)
    requestsByPassenger.set(request.bookingPassengerId, requests)
  }

  return (
    <section className={styles.card}>
      <ul className={styles.list}>
        {booking.passengers.map((passenger, index) => {
          const requests = requestsByPassenger.get(passenger.bookingPassengerId) ?? []
          const lapAdult = passenger.lapOfBookingPassengerId
            ? booking.passengers.find((adult) => adult.bookingPassengerId === passenger.lapOfBookingPassengerId)
            : undefined

          return (
            <li className={styles.row} key={passenger.bookingPassengerId}>
              <span className={styles.avatar} aria-hidden="true">
                {initialOf(passenger.firstName)}
              </span>

              <div className={styles.info}>
                <p className={styles.name}>
                  {passenger.firstName} {passenger.lastName}
                </p>
                <p className={styles.role}>
                  {passengerRole(passenger, index)}
                  {lapAdult ? ` · on ${lapAdult.firstName}'s lap` : ''}
                </p>
              </div>

              {requests.length > 0 ? (
                <div className={styles.requests}>
                  {requests.map((request) => {
                    const chip = serviceRequestChip(request.status)
                    return (
                      <StatusChip
                        key={request.serviceRequestId}
                        label={`${request.serviceCode} · ${chip.label}`}
                        tone={chip.tone}
                        className={styles.requestChip}
                      />
                    )
                  })}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className={styles.actions}>
        <FeatureAction label="Request assistance" reason={ASSISTANCE_DISABLED} className={controls.link} />
      </div>
    </section>
  )
}
