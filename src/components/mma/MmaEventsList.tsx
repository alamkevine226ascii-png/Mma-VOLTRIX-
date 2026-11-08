'use client'

/**
 * MODULE MMA — Vue Événements : liste des événements à venir / passés.
 */
import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, ChevronRight, Swords, History } from 'lucide-react'
import { useApi, formatDateFr, formatTimeFr, daysUntil } from '@/components/voltrix/api'
import {
  MmaEventsResponse,
  MmaEventListItem,
  ORG_STYLES,
  STATUS_CLASSES,
  STATUS_LABELS,
} from '@/components/mma/types'
import { cn } from '@/lib/utils'

interface MmaEventsListProps {
  onOpenEvent: (eventId: string) => void
}

export function MmaEventsList({ onOpenEvent }: MmaEventsListProps) {
  const [window, setWindow] = useState<'upcoming' | 'past'>('upcoming')
  const { data, loading, error } = useApi<MmaEventsResponse>(
    `/api/mma/events?window=${window}`
  )

  const events = data?.events ?? []
  const grouped = useMemo(() => {
    const byOrg = new Map<string, MmaEventListItem[]>()
    for (const e of events) {
      const list = byOrg.get(e.organization) ?? []
      list.push(e)
      byOrg.set(e.organization, list)
    }
    return [...byOrg.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  return (
    <section aria-label="Événements MMA" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Swords className="h-5 w-5 text-rose-300" aria-hidden="true" />
            Événements MMA
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Cartes officielles synchronisées depuis ESPN · UFC, PFL, Bellator
          </p>
        </div>
        <div className="flex glass-soft rounded-xl p-1 self-start" role="tablist" aria-label="Fenêtre temporelle">
          <WindowButton active={window === 'upcoming'} onClick={() => setWindow('upcoming')} label="À venir" />
          <WindowButton active={window === 'past'} onClick={() => setWindow('past')} label="Résultats" />
        </div>
      </div>

      {error && (
        <p className="glass rounded-xl p-4 text-sm text-red-200" role="alert">
          Impossible de charger les événements : {error}
        </p>
      )}

      {loading && events.length === 0 && !error && <EventsSkeleton />}

      {!loading && events.length === 0 && !error && (
        <p className="glass rounded-2xl p-6 text-sm text-zinc-400 text-center">
          Aucun événement dans cette fenêtre.
        </p>
      )}

      {grouped.map(([org, list]) => (
        <div key={org} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 px-1">
            {ORG_STYLES[org]?.label ?? org} · {list.length} événement{list.length > 1 ? 's' : ''}
          </h3>
          <div className="grid gap-3">
            {list.map((e) => (
              <EventCard key={e.id} event={e} onOpen={() => onOpenEvent(e.id)} />
            ))}
          </div>
        </div>
      ))}

      {data?.lastSyncAt && (
        <p className="text-[11px] text-zinc-600 px-1">
          Dernière synchronisation : {formatDateFr(data.lastSyncAt, { weekday: undefined })} à{' '}
          {formatTimeFr(data.lastSyncAt)} UTC
          {data.syncStatus ? ` · ${data.syncStatus}` : ''}
        </p>
      )}
    </section>
  )
}

function WindowButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-lg px-3.5 h-9 text-sm font-medium transition-all',
        active ? 'glass-strong text-violet-200' : 'text-zinc-400 hover:text-zinc-200'
      )}
    >
      {label}
    </button>
  )
}

function EventCard({ event, onOpen }: { event: MmaEventListItem; onOpen: () => void }) {
  const org = ORG_STYLES[event.organization] ?? {
    label: event.organization,
    badge: 'text-zinc-200 bg-white/10 border-white/20',
  }
  const d = daysUntil(event.date)
  const countdown =
    d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : d > 1 ? `Dans ${d} j` : `Il y a ${-d} j`

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass glass-hover rounded-2xl p-4 sm:p-5 w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', org.badge)}>
              {org.label}
            </span>
            <span
              className={cn(
                'text-[11px] px-2 py-0.5 rounded-md border',
                STATUS_CLASSES[event.status] ?? 'text-zinc-300 bg-white/5 border-white/15'
              )}
            >
              {STATUS_LABELS[event.status] ?? event.status}
            </span>
            <span className="text-[11px] text-zinc-500">{countdown}</span>
          </div>
          <p className="font-semibold text-zinc-100 leading-snug group-hover:text-white transition-colors">
            {event.name}
          </p>
          {event.mainEvent && (
            <p className="text-sm text-zinc-400 mt-0.5 truncate">Tête d'affiche : {event.mainEvent}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDateFr(event.date)} · {formatTimeFr(event.date)} UTC
            </span>
            {event.venue && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {event.venue}
                  {event.city ? `, ${event.city}` : ''}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {event.fightsCount} combat{event.fightsCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <ChevronRight
          className="h-5 w-5 text-zinc-600 group-hover:text-violet-300 shrink-0 mt-1 transition-colors"
          aria-hidden="true"
        />
      </div>
    </button>
  )
}

function EventsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement des événements">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass-soft rounded-2xl p-5 h-28 voltrix-pulse" />
      ))}
    </div>
  )
}
