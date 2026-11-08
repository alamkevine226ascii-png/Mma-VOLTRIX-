'use client'

/**
 * MODULE MMA — Vue Événement : carte complète des combats, groupée par segment.
 */
import { ArrowLeft, CalendarDays, MapPin, Trophy } from 'lucide-react'
import { useApi, formatDateTimeFr } from '@/components/voltrix/api'
import {
  MmaEventDetail,
  ORG_STYLES,
  RESULT_LABELS,
  STATUS_CLASSES,
  STATUS_LABELS,
} from '@/components/mma/types'
import { cn } from '@/lib/utils'

interface MmaEventDetailProps {
  eventId: string
  onBack: () => void
  onOpenFight: (fightId: string) => void
}

const SEGMENT_ORDER = ['Main Card', 'Prelims', 'Early Prelims']

export function MmaEventDetailView({ eventId, onBack, onOpenFight }: MmaEventDetailProps) {
  const { data, loading, error } = useApi<{ event: MmaEventDetail }>(`/api/mma/events/${eventId}`)

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="glass-soft rounded-2xl h-32 voltrix-pulse" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-soft rounded-2xl h-20 voltrix-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data?.event) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <p className="glass rounded-xl p-4 text-sm text-red-200" role="alert">
          {error ?? 'Événement introuvable'}
        </p>
      </div>
    )
  }

  const e = data.event
  const org = ORG_STYLES[e.organization] ?? {
    label: e.organization,
    badge: 'text-zinc-200 bg-white/10 border-white/20',
  }

  const segments = SEGMENT_ORDER.filter((s) => e.fights.some((f) => f.cardSegment === s))
  const others = e.fights.filter((f) => !SEGMENT_ORDER.includes(f.cardSegment ?? ''))

  return (
    <section aria-label={`Carte de ${e.name}`} className="space-y-5">
      <BackButton onBack={onBack} label="Événements" />

      <header className="glass rounded-2xl p-5 sm:p-6 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/40 to-transparent"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', org.badge)}>
            {org.label}
          </span>
          <span
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-md border',
              STATUS_CLASSES[e.status] ?? 'text-zinc-300 bg-white/5 border-white/15'
            )}
          >
            {STATUS_LABELS[e.status] ?? e.status}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-zinc-50 leading-tight">{e.name}</h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-sm text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            {formatDateTimeFr(e.date)} UTC
          </span>
          {e.venue && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              {e.venue}
              {e.city ? `, ${e.city}` : ''}
              {e.country ? ` (${e.country})` : ''}
            </span>
          )}
        </div>
      </header>

      {segments.map((segment) => (
        <FightSegment
          key={segment}
          title={segment === 'Main Card' ? 'Carte principale' : segment === 'Prelims' ? 'Prelims' : 'Prelims précoces'}
          fights={e.fights.filter((f) => f.cardSegment === segment)}
          onOpenFight={onOpenFight}
        />
      ))}
      {others.length > 0 && (
        <FightSegment title="Autres combats" fights={others} onOpenFight={onOpenFight} />
      )}

      <p className="text-[11px] text-zinc-600 px-1">
        Carte synchronisée depuis ESPN · {e.fights.length} combats enregistrés
      </p>
    </section>
  )
}

function FightSegment({
  title,
  fights,
  onOpenFight,
}: {
  title: string
  fights: MmaEventDetail['fights']
  onOpenFight: (id: string) => void
}) {
  if (fights.length === 0) return null
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 px-1">{title}</h3>
      <div className="space-y-2.5">
        {fights.map((f) => (
          <FightRow key={f.id} fight={f} onOpen={() => onOpenFight(f.id)} />
        ))}
      </div>
    </div>
  )
}

function FightRow({
  fight,
  onOpen,
}: {
  fight: MmaEventDetail['fights'][number]
  onOpen: () => void
}) {
  const [f1, f2] = fight.fighters
  const complete = fight.fighters.length === 2
  const isTba = !complete || !f1 || !f2

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isTba}
      className={cn(
        'glass glass-hover rounded-2xl p-4 w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
        isTba && 'opacity-60 cursor-default'
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="font-medium text-zinc-400">
            {fight.weightClassFr ?? fight.weightClass ?? 'Catégorie non communiquée'}
          </span>
          {fight.scheduledRounds && <span>· {fight.scheduledRounds} rounds</span>}
        </div>
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-md border shrink-0',
            STATUS_CLASSES[fight.status] ?? 'text-zinc-400 bg-white/5 border-white/15'
          )}
        >
          {STATUS_LABELS[fight.status] ?? fight.status}
        </span>
      </div>

      {isTba ? (
        <p className="text-sm text-zinc-400">
          {f1 ? f1.fullName : 'Adversaire'} <span className="text-zinc-600">contre à annoncer</span>
        </p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <FighterSide fighter={f1} align="left" />
          <span className="text-[10px] font-bold text-zinc-600 tracking-widest" aria-hidden="true">
            VS
          </span>
          <FighterSide fighter={f2} align="right" />
        </div>
      )}

      {fight.status === 'TERMINE' && fight.resultDetail && (
        <p className="mt-2.5 text-xs text-zinc-400 inline-flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-300/80" aria-hidden="true" />
          {fight.resultDetail}
          {fight.durationSeconds != null && ` · ${Math.floor(fight.durationSeconds / 60)}:${String(fight.durationSeconds % 60).padStart(2, '0')}`}
        </p>
      )}
    </button>
  )
}

function FighterSide({
  fighter,
  align,
}: {
  fighter: MmaEventDetail['fights'][number]['fighters'][number]
  align: 'left' | 'right'
}) {
  const record =
    fighter.wins != null
      ? `${fighter.wins}-${fighter.losses ?? '?'}-${fighter.draws ?? '?'}`
      : fighter.recordAtFight ?? 'n/d'
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="font-semibold text-sm sm:text-base text-zinc-100 truncate group-hover:text-white transition-colors">
        {fighter.fullName}
        {fighter.isWinner === true && <span className="ml-1.5 text-emerald-300 text-xs">✓</span>}
      </p>
      <p className="text-xs text-zinc-500 mt-0.5">
        {record}
        {fighter.lastResults && (
          <span className="ml-2 inline-flex gap-0.5" aria-label="Forme récente">
            {fighter.lastResults.split(',').slice(0, 5).map((r, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold',
                  r === 'W'
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : r === 'L'
                      ? 'bg-red-400/20 text-red-300'
                      : 'bg-zinc-400/20 text-zinc-300'
                )}
              >
                {RESULT_LABELS[r] ?? r}
              </span>
            ))}
          </span>
        )}
      </p>
    </div>
  )
}

export function BackButton({ onBack, label = 'Retour' }: { onBack: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-violet-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg px-2 py-1 -ml-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}
