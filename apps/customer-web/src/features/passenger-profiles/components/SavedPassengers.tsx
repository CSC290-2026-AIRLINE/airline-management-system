import { useState } from 'react'
import { birthDateLabel, initials, useProfile, type Passenger } from '@customer-web/features/passenger-profiles/profile-context'
import RemovePassengerDialog from '@customer-web/features/passenger-profiles/components/RemovePassengerDialog'
import PassengerDialog from '@customer-web/features/passenger-profiles/components/PassengerDialog'
import editIcon from '@customer-web/features/passenger-profiles/assets/edit.svg'
export default function SavedPassengers() {
  const { passengers, savePassenger, removePassenger } = useProfile()
  const [dialog, setDialog] = useState<{ type: 'remove'; passenger: Passenger } | { type: 'edit'; passenger?: Passenger } | null>(null)
  return (
    <section className="profile-card profile-passengers" aria-labelledby="passengers-title">
      <header className="profile-card-header">
        <div>
          <h2 id="passengers-title">Saved Passengers</h2>
          <p>Family and companions you book for.</p>
        </div>
        <button className="profile-button profile-add" onClick={() => setDialog({ type: 'edit' })}>
          <span className="profile-desktop">+ Add passenger</span>
          <span className="profile-mobile">+ Add</span>
        </button>
      </header>
      {passengers.length === 0 && (
        <p className="profile-empty">No saved passengers yet. Add a family member or companion to get started.</p>
      )}
      {passengers.map((passenger) => (
        <article className="profile-passenger" key={passenger.id}>
          <span className="profile-passenger-avatar" aria-hidden="true">
            {initials(passenger.name)}
          </span>
          <div className="profile-passenger-info">
            <div className="profile-passenger-name">
              <strong>{passenger.name}</strong>
              {passenger.relationship && <span className="profile-chip">{passenger.relationship}</span>}
            </div>
            <p>
              <span className="profile-desktop">DOB </span>
              {birthDateLabel(passenger.dateOfBirth, true)} · {passenger.gender} · {passenger.nationality}
            </p>
          </div>
          <div className="profile-passenger-actions">
            <button
              className="profile-icon-button"
              aria-label={`Edit ${passenger.name}`}
              onClick={() => setDialog({ type: 'edit', passenger })}
            >
              <img src={editIcon} alt="" />
            </button>
            <button className="profile-link profile-link--danger" onClick={() => setDialog({ type: 'remove', passenger })}>
              Remove<span className="profile-sr-only"> {passenger.name}</span>
            </button>
          </div>
        </article>
      ))}
      {dialog?.type === 'remove' && (
        <RemovePassengerDialog
          name={dialog.passenger.name}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await removePassenger(dialog.passenger.id)
            setDialog(null)
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <PassengerDialog
          passenger={dialog.passenger}
          onClose={() => setDialog(null)}
          onSave={async (passenger) => {
            await savePassenger(passenger)
            setDialog(null)
          }}
        />
      )}
    </section>
  )
}
