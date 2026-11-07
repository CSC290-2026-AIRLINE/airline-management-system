import { AirportContactsCard } from '../components/AirportContactsCard'
import { useStationContacts } from '../hooks/useStationContacts'

/**
 * Deliveries (Figma "F10 / Staff / Desktop / 06 Deliveries — Update status and costs"). Only the Airport contacts card
 * is built: the delivery list, delivery status and recovery costs wait for their backend.
 */
export function DeliveriesPage() {
  const contacts = useStationContacts()

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-[48px] leading-none font-extrabold tracking-[-2.4px] text-[#14213d] max-md:text-[36px]">
          Deliveries
        </h1>
        <p className="text-lg tracking-[-0.9px] text-[#677287]">
          Confirmed bags on their way back. The airline covers every cost; the passenger never pays.
        </p>
      </header>
      <AirportContactsCard contacts={contacts.contacts} loading={contacts.loading} error={contacts.error} onSave={contacts.save} />
    </>
  )
}
