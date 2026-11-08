'use client'

/**
 * MODULE FOOTBALL — Vue matches (moteur football isolé, non modifié par le MMA).
 */
import { useMemo } from 'react'
import { CircleDot, Trophy } from 'lucide-react'
import { useApi, formatDateFr, formatTimeFr } from '@/components/voltrix/api'
import { cn } from '@/lib/utils'

interface FootballMatch {
  id: string
  league: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  homeTeamAbbr: string | null
  awayTeamAbbr: string | null
  homeLogo: string | null
  awayLogo: string | null
  date: string
  status: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
  lastSyncedAt: string
}

interface FootballResponse {
  matches: FootballMatch[]
  leagues: { code: string; name: string }[]
  syncStatus: string | null
}

const STATUS_FOOTBALL: Record<string, { label: string; cls: string }> = {
  PROGRAMME: { label: 'Programmé', cls: 'text-amber-200 bg-amber-400/10 border-amber-300/25' },
  EN_COURS: { label: 'En cours', cls: 'text-rose-200 bg-rose-400/10 border-rose-300/25' },
  TERMINE: { label: 'Terminé', cls: 'text-zinc-300 bg-zinc-400/10 border-zinc-300/25' },
}

export function FootballView() {
  const { data, loading, error } = useApi<FootballResponse>('/api/football/matches')

  const grouped = useMemo(() => {
    const map = new Map<string, FootballMatch[]>()
    for (const m of data?.matches ?? []) {
      const list = map.get(m.leagueName) ?? []
      list.push(m)
      map.set(m.leagueName, list)
    }
    return [...map.entries()]
  }, [data])

  return (
    <section aria-label="Matchs de football" className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          Football
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Matchs des grands championnats · fenêtre -2 à +7 jours · ESPN
        </p>
      </div>

      {error && (
        <p className="glass rounded-xl p-4 text-sm text-red-200" role="alert">
          Impossible de charger les matchs : {error}
        </p>
      )}

      {loading && !data && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-soft rounded-2xl h-20 voltrix-pulse" />
          ))}
        </div>
      )}

      {!loading && grouped.length === 0 && !error && (
        <p className="glass rounded-2xl p-6 text-sm text-zinc-400 text-center">
          Aucun match dans la fenêtre de synchronisation.
        </p>
      )}

      {grouped.map(([leagueName, matches]) => (
        <div key={leagueName} className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 px-1">
            {leagueName} · {matches.length} match{matches.length > 1 ? 's' : ''}
          </h3>
          <div className="space-y-2.5">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function MatchRow({ match }: { match: FootballMatch }) {
  const st = STATUS_FOOTBALL[match.status] ?? {
    label: match.status,
    cls: 'text-zinc-300 bg-white/5 border-white/15',
  }
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1.5">
          {match.status === 'EN_COURS' ? (
            <CircleDot className="h-3 w-3 text-rose-300 voltrix-pulse" aria-hidden="true" />
          ) : null}
          {formatDateFr(match.date, { weekday: undefined })} · {formatTimeFr(match.date)} UTC
          {match.venue ? ` · ${match.venue}` : ''}
        </span>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-md border', st.cls)}>{st.label}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0 justify-start text-left">
          {match.homeLogo && (
            <img src={match.homeLogo} alt="" className="h-6 w-6 object-contain shrink-0" loading="lazy" />
          )}
          <span className="text-sm font-medium text-zinc-100 truncate">{match.homeTeam}</span>
        </div>
        <div className="font-mono text-base font-bold text-zinc-50 tabular-nums px-2">
          {match.homeScore != null && match.awayScore != null
            ? `${match.homeScore} – ${match.awayScore}`
            : '–'}
        </div>
        <div className="flex items-center gap-2.5 min-w-0 justify-end text-right">
          <span className="text-sm font-medium text-zinc-100 truncate">{match.awayTeam}</span>
          {match.awayLogo && (
            <img src={match.awayLogo} alt="" className="h-6 w-6 object-contain shrink-0" loading="lazy" />
          )}
        </div>
      </div>
    </div>
  )
}
