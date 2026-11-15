import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@customer-web/components/ui/avatar'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Separator } from '@customer-web/components/ui/separator'
import { birthDateLabel, initials, useProfile, type Passenger } from '@customer-web/features/passenger-profiles/profile-context'
import RemovePassengerDialog from '@customer-web/features/passenger-profiles/components/RemovePassengerDialog'
import PassengerDialog from '@customer-web/features/passenger-profiles/components/PassengerDialog'

export default function SavedPassengers() {
  const { passengers, savePassenger, removePassenger } = useProfile()
  const [dialog, setDialog] = useState<{ type: 'remove'; passenger: Passenger } | { type: 'edit'; passenger?: Passenger } | null>(null)
  return (
    <Card aria-labelledby="passengers-title">
      <CardHeader>
        <CardTitle id="passengers-title" role="heading" aria-level={2}>
          Saved Passengers
        </CardTitle>
        <CardDescription>Family and companions you book for.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setDialog({ type: 'edit' })}>
            <Plus />
            <span>
              Add<span className="hidden sm:inline"> passenger</span>
            </span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {passengers.length === 0 && (
          <p className="text-sm text-muted-foreground">No saved passengers yet. Add a family member or companion to get started.</p>
        )}
        <ul>
          {passengers.map((passenger, index) => (
            <li key={passenger.id}>
              {index > 0 && <Separator className="my-3" />}
              <div className="flex items-center gap-3">
                <Avatar aria-hidden="true">
                  <AvatarFallback>{initials(passenger.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate font-medium">{passenger.name}</strong>
                    {passenger.relationship && <Badge variant="secondary">{passenger.relationship}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="hidden sm:inline">DOB </span>
                    {birthDateLabel(passenger.dateOfBirth, true)} · {passenger.gender} · {passenger.nationality}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${passenger.name}`}
                  onClick={() => setDialog({ type: 'edit', passenger })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDialog({ type: 'remove', passenger })}
                >
                  Remove<span className="sr-only"> {passenger.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
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
    </Card>
  )
}
