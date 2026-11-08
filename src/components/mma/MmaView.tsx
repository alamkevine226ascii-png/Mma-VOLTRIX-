'use client'

/**
 * MODULE MMA — Vue racine : navigation interne
 * Événements -> Événement -> Combat.
 */
import { useState } from 'react'
import { MmaEventsList } from '@/components/mma/MmaEventsList'
import { MmaEventDetailView } from '@/components/mma/MmaEventDetailView'
import { MmaFightDetailView } from '@/components/mma/MmaFightDetailView'

type MmaView =
  | { name: 'events' }
  | { name: 'event'; eventId: string }
  | { name: 'fight'; fightId: string; eventId: string }

export function MmaView() {
  const [view, setView] = useState<MmaView>({ name: 'events' })

  if (view.name === 'event') {
    return (
      <MmaEventDetailView
        eventId={view.eventId}
        onBack={() => setView({ name: 'events' })}
        onOpenFight={(fightId) => setView({ name: 'fight', fightId, eventId: view.eventId })}
      />
    )
  }

  if (view.name === 'fight') {
    return (
      <MmaFightDetailView
        fightId={view.fightId}
        onBack={() => setView({ name: 'event', eventId: view.eventId })}
      />
    )
  }

  return <MmaEventsList onOpenEvent={(eventId) => setView({ name: 'event', eventId })} />
}
