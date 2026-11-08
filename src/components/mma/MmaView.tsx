'use client'

/**
 * MODULE MMA — Vue racine : navigation interne
 * Événements -> Événement -> Combat.
 * Navigation par contexte React (aucune requête serveur, aucun /api) :
 * l'événement sélectionné est transmis directement à la vue détail.
 */
import { useState } from 'react'
import type { ScoreboardEventDTO } from '@/lib/espn'
import type { FightContext } from '@/lib/mma/loaders'
import { MmaEventsList } from '@/components/mma/MmaEventsList'
import { MmaEventDetailView } from '@/components/mma/MmaEventDetailView'
import { MmaFightDetailView } from '@/components/mma/MmaFightDetailView'

type MmaView =
  | { name: 'events' }
  | { name: 'event'; event: ScoreboardEventDTO }
  | { name: 'fight'; ctx: FightContext; event: ScoreboardEventDTO }

export function MmaView() {
  const [view, setView] = useState<MmaView>({ name: 'events' })

  if (view.name === 'event') {
    return (
      <MmaEventDetailView
        event={view.event}
        onBack={() => setView({ name: 'events' })}
        onOpenFight={(ctx) => setView({ name: 'fight', ctx, event: view.event })}
      />
    )
  }

  if (view.name === 'fight') {
    return (
      <MmaFightDetailView
        ctx={view.ctx}
        onBack={() => setView({ name: 'event', event: view.event })}
      />
    )
  }

  return <MmaEventsList onOpenEvent={(event) => setView({ name: 'event', event })} />
}
