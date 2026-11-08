/**
 * MODULE FOOTBALL — moteur isolé de VOLTRIX.
 *
 * Ce module est INDÉPENDANT du module MMA : il possède son propre service,
 * sa propre table (FootballMatch) et n'importe rien du module MMA.
 * Le module MMA ne modifie jamais ce fichier (règle de non-régression).
 *
 * Source vérifiée le 2026-11-08 : ESPN soccer scoreboard (sans clé).
 */
import { db } from '@/lib/db'
import { CACHE_TTL, providerFetchJson } from '@/modules/core/http'
import { SyncTracker } from '@/modules/core/sync-log'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

/** Championnats couverts par le moteur football de VOLTRIX. */
export const FOOTBALL_LEAGUES: { code: string; name: string }[] = [
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'LaLiga' },
  { code: 'ita.1', name: 'Serie A' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'fra.1', name: 'Ligue 1' },
  { code: 'uefa.champions', name: 'Ligue des Champions' },
]

const SYNC_WINDOW_PAST_DAYS = 2
const SYNC_WINDOW_FUTURE_DAYS = 7
export const FOOTBALL_SYNC_TTL_MS = 10 * 60 * 1000

/**
 * Note vérifiée le 2026-11-08 : le scoreboard soccer ESPN refuse le paramètre
 * de plage `dates=A-B` (HTTP 400, contrairement au MMA). On utilise donc le
 * scoreboard par journée (journée en cours), puis on filtre les résultats en
 * lecture sur la fenêtre [-2 j ; +7 j].
 */

interface EspnSoccerCompetitor {
  homeAway?: string
  score?: string | number
  team?: { displayName?: string; abbreviation?: string; logo?: string }
}

interface EspnSoccerCompetition {
  competitors?: EspnSoccerCompetitor[]
  status?: { type?: { state?: string; name?: string; description?: string } }
  venue?: { fullName?: string }
}

interface EspnSoccerEvent {
  id?: string
  date?: string
  name?: string
  competitions?: EspnSoccerCompetition[]
}

function mapStatus(state?: string, name?: string): 'PROGRAMME' | 'EN_COURS' | 'TERMINE' {
  const n = (name ?? '').toUpperCase()
  if (n.includes('CANCEL')) return 'TERMINE'
  if (n.includes('POSTPONED')) return 'PROGRAMME'
  if (state === 'pre') return 'PROGRAMME'
  if (state === 'in') return 'EN_COURS'
  if (state === 'post') return 'TERMINE'
  return 'PROGRAMME'
}

/** Synchronise les matchs de football sur la fenêtre [-2 j ; +7 j]. */
export async function syncFootballMatches(): Promise<{
  status: string
  itemsFetched: number
  itemsCreated: number
  itemsUpdated: number
  durationMs: number
  errors: { step: string; message: string }[]
}> {
  const tracker = new SyncTracker('football', 'matches')
  await tracker.start()

  for (const league of FOOTBALL_LEAGUES) {
    try {
      const data = await providerFetchJson<{ events?: EspnSoccerEvent[] }>(
        'espn',
        `${SITE}/${league.code}/scoreboard`,
        { cacheKey: `espn:/soccer/${league.code}/scoreboard/current`, ttlMs: CACHE_TTL.football }
      )
      const events = data?.events ?? []
      tracker.addFetched(events.length)
      for (const ev of events) {
        if (!ev.id || !ev.date) continue
        const comp = ev.competitions?.[0]
        const home = comp?.competitors?.find((c) => c.homeAway === 'home')
        const away = comp?.competitors?.find((c) => c.homeAway === 'away')
        if (!home?.team?.displayName || !away?.team?.displayName) continue
        await db.footballMatch.upsert({
          where: { externalId: `espn:${league.code}:${ev.id}` },
          create: {
            externalId: `espn:${league.code}:${ev.id}`,
            league: league.code,
            leagueName: league.name,
            homeTeam: home.team.displayName,
            awayTeam: away.team.displayName,
            homeTeamAbbr: home.team.abbreviation ?? null,
            awayTeamAbbr: away.team.abbreviation ?? null,
            homeLogo: home.team.logo ?? null,
            awayLogo: away.team.logo ?? null,
            date: new Date(ev.date),
            status: mapStatus(comp?.status?.type?.state, comp?.status?.type?.name),
            rawStatus: comp?.status?.type?.state ?? null,
            homeScore: home.score != null ? Number(home.score) : null,
            awayScore: away.score != null ? Number(away.score) : null,
            venue: comp?.venue?.fullName ?? null,
            lastSyncedAt: new Date(),
          },
          update: {
            homeTeam: home.team.displayName,
            awayTeam: away.team.displayName,
            date: new Date(ev.date),
            status: mapStatus(comp?.status?.type?.state, comp?.status?.type?.name),
            rawStatus: comp?.status?.type?.state ?? null,
            homeScore: home.score != null ? Number(home.score) : null,
            awayScore: away.score != null ? Number(away.score) : null,
            venue: comp?.venue?.fullName ?? null,
            lastSyncedAt: new Date(),
          },
        })
        tracker.addUpdated(1)
      }
    } catch (err) {
      tracker.addError(`league:${league.code}`, err instanceof Error ? err.message : String(err))
    }
  }

  return tracker.finish()
}

export async function ensureFreshFootball(): Promise<void> {
  const last = await db.syncLog.findFirst({
    where: { module: 'football', status: { in: ['SUCCESS', 'PARTIAL'] } },
    orderBy: { startedAt: 'desc' },
  })
  if (!last || Date.now() - (last.finishedAt?.getTime() ?? 0) > FOOTBALL_SYNC_TTL_MS) {
    await syncFootballMatches()
  }
}

export interface FootballMatchView {
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

export async function listFootballMatches(): Promise<FootballMatchView[]> {
  const from = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000)
  const to = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86400000)
  const matches = await db.footballMatch.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: 'asc' }, { league: 'asc' }],
  })
  return matches.map((m) => ({
    id: m.id,
    league: m.league,
    leagueName: m.leagueName,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeTeamAbbr: m.homeTeamAbbr,
    awayTeamAbbr: m.awayTeamAbbr,
    homeLogo: m.homeLogo,
    awayLogo: m.awayLogo,
    date: m.date.toISOString(),
    status: m.status,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    venue: m.venue,
    lastSyncedAt: m.lastSyncedAt.toISOString(),
  }))
}
