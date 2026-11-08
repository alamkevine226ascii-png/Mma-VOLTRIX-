/**
 * MODULE MMA — Adaptateur ESPN.
 *
 * Endpoints réellement vérifiés le 2026-11-08 (voir scripts/AUDIT_SOURCES.md) :
 *  - GET site.api.espn.com/apis/site/v2/sports/mma/{league}/scoreboard?dates=YYYYMMDD-YYYYMMDD
 *  - GET sports.core.api.espn.com/v2/sports/mma/leagues/{league}/events/{eid}/competitions/{cid}
 *  - GET .../competitions/{cid}/status
 *  - GET .../competitions/{cid}/competitors/{aid}/statistics
 *  - GET sports.core.api.espn.com/v2/sports/mma/athletes/{aid}
 *  - GET .../athletes/{aid}/statistics
 *  - GET .../athletes/{aid}/records/0
 *  - GET site.web.api.espn.com/apis/common/v3/sports/mma/athletes/{aid}  (historique)
 *
 * Aucune donnée n'est fabriquée : un champ absent chez le fournisseur reste null.
 */
import { CACHE_TTL, providerFetchJson } from '@/modules/core/http'
import {
  fightDurationSeconds,
  mapEspnStatus,
  mapResultMethod,
  resultMethodDetail,
  type FightStatus,
  type Organization,
} from '@/modules/mma/types'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma'
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma'
const CORE_LEAGUES = `${CORE}/leagues`
const COMMON_V3 = 'https://site.web.api.espn.com/apis/common/v3/sports/mma'

/** Codes de ligue contenus dans les UID ESPN (vérifiés le 2026-11-08). */
export const ESPN_LEAGUE_UIDS: Record<string, string> = {
  '3321': 'ufc',
  '3347': 'pfl',
  '3323': 'bellator',
}

export const ESPN_LEAGUES: Record<Organization, string> = {
  UFC: 'ufc',
  PFL: 'pfl',
  BELLATOR: 'bellator',
}

/** Analyse un uid de combat ESPN "s:3301~l:3321~e:xxx~c:yyy". */
export function parseFightUid(uid: string): { leagueId: string; eventId: string; competitionId: string } | null {
  const m = uid.match(/~l:(\d+)~e:(\d+)~c:(\d+)/)
  if (!m) return null
  return { leagueId: m[1], eventId: m[2], competitionId: m[3] }
}

// ---------------------------------------------------------------------------
// Types bruts ESPN (partiels, tolérants — la source reste hétérogène)
// ---------------------------------------------------------------------------

interface EspnAddress {
  city?: string
  country?: string
}
interface EspnVenue {
  fullName?: string
  address?: EspnAddress
}
interface EspnStatusType {
  state?: string
  name?: string
  completed?: boolean
  description?: string
}
interface EspnStatus {
  clock?: number
  displayClock?: string
  period?: number
  type?: EspnStatusType
  result?: { name?: string | null; description?: string | null }
}
interface EspnRecord {
  summary?: string
  type?: string
}
interface EspnCompetitor {
  id?: string
  order?: number
  winner?: boolean
  athlete?: { displayName?: string; fullName?: string }
  records?: EspnRecord[]
}
interface EspnCompetition {
  id?: string
  date?: string
  status?: EspnStatus
  competitors?: EspnCompetitor[]
}
interface EspnEvent {
  id?: string
  name?: string
  shortName?: string
  date?: string
  status?: EspnStatus
  venues?: EspnVenue[]
  competitions?: EspnCompetition[]
}

interface CoreAthlete {
  fullName?: string
  nickname?: string
  dateOfBirth?: string
  citizenship?: string
  height?: number
  reach?: number
  weight?: number
  weightClass?: { text?: string }
  stance?: { text?: string }
  styles?: { text?: string }[]
  status?: { type?: string }
  headshot?: { href?: string }
  flag?: { href?: string }
}

interface CoreStatItem {
  name?: string
  value?: number
  displayValue?: string
}
interface CoreStatistics {
  splits?: { categories?: { name?: string; stats?: CoreStatItem[] }[] }
}

interface CoreRecord {
  stats?: CoreStatItem[]
}

interface CoreCompetition {
  type?: { text?: string }
  format?: { regulation?: { periods?: number } }
  cardSegment?: { description?: string }
  matchNumber?: number
  status?: EspnStatus
  date?: string
}

interface CommonV3Athlete {
  events?: string[]
  eventsMap?: Record<
    string,
    {
      id?: string
      uid?: string
      name?: string
      gameDate?: string
      gameResult?: string
      titleFight?: boolean
      opponent?: { id?: string; displayName?: string }
    }
  >
}

// ---------------------------------------------------------------------------
// DTO normalisés du domaine
// ---------------------------------------------------------------------------

export interface ScoreboardFightDTO {
  externalId: string
  status: FightStatus
  rawStatus: string | null
  date: Date
  fighters: {
    externalId: string
    fullName: string
    recordAtFight: string | null
    isWinner: boolean | null
    corner: number | null
  }[]
}

export interface ScoreboardEventDTO {
  externalId: string
  organization: Organization
  name: string
  shortName: string | null
  date: Date
  status: FightStatus
  rawStatus: string | null
  venueName: string | null
  city: string | null
  country: string | null
  fights: ScoreboardFightDTO[]
}

export interface FightDetailDTO {
  externalId: string
  weightClass: string | null
  scheduledRounds: number | null
  cardSegment: string | null
  matchNumber: number | null
  status: FightStatus
  rawStatus: string | null
  durationSeconds: number | null
  resultMethod: ReturnType<typeof mapResultMethod>
  resultDetail: string | null
  winnerExternalId: string | null
}

export interface FighterProfileDTO {
  externalId: string
  fullName: string | null
  nickname: string | null
  birthDate: string | null
  nationality: string | null
  heightInches: number | null
  reachInches: number | null
  weightLbs: number | null
  weightClass: string | null
  stance: string | null
  fightingStyle: string | null
  active: boolean | null
  imageUrl: string | null
  flagUrl: string | null
}

export interface FighterStatsDTO {
  sigStrikesLandedPerMin: number | null
  strikingAccuracy: number | null
  takedownsPer15Min: number | null
  takedownAccuracy: number | null
  submissionsPer15Min: number | null
  koPercentage: number | null
  tkoPercentage: number | null
  decisionPercentage: number | null
}

export interface FighterRecordDTO {
  wins: number | null
  losses: number | null
  draws: number | null
  noContests: number | null
  winsByKo: number | null
  winsBySub: number | null
  titleWins: number | null
}

export interface FightHistoryEntryDTO {
  externalFightKey: string
  espnEventId: string | null
  espnCompetitionId: string | null
  espnLeagueId: string | null
  eventName: string | null
  eventDate: Date
  result: string
  opponentName: string
  opponentExternalId: string | null
  titleFight: boolean
}

export interface FightStatsBreakdown {
  sigStrikesLanded: number | null
  sigStrikesAttempted: number | null
  takedownsLanded: number | null
  takedownsAttempted: number | null
  submissions: number | null
  knockdowns: number | null
  controlSeconds: number | null
}

// ---------------------------------------------------------------------------
// Adaptateur
// ---------------------------------------------------------------------------

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export class EspnMmaProvider {
  readonly providerId = 'espn'

  /** Scoreboard d'une organisation sur une fenêtre de dates (UTC). */
  async getScoreboard(org: Organization, from: Date, to: Date): Promise<ScoreboardEventDTO[]> {
    const league = ESPN_LEAGUES[org]
    const url = `${SITE}/${league}/scoreboard?dates=${fmtDate(from)}-${fmtDate(to)}`
    const data = await providerFetchJson<{ events?: EspnEvent[] }>('espn', url, {
      cacheKey: `espn:/mma/${league}/scoreboard/${fmtDate(from)}-${fmtDate(to)}`,
      ttlMs: CACHE_TTL.scoreboard,
    })
    if (!data?.events) return []
    return data.events
      .filter((e) => e.id && e.date)
      .map((e) => this.mapEvent(e, org))
  }

  private mapEvent(e: EspnEvent, org: Organization): ScoreboardEventDTO {
    const date = new Date(e.date as string)
    const venue = e.venues?.[0]
    const fights = (e.competitions ?? [])
      .filter((c) => c.id)
      .map((c) => this.mapCompetition(c, date))
    return {
      externalId: `espn:${org.toLowerCase()}:event:${e.id}`,
      organization: org,
      name: e.name ?? 'Événement sans nom',
      shortName: e.shortName ?? null,
      date,
      status: mapEspnStatus(e.status?.type, date),
      rawStatus: e.status?.type?.state ?? null,
      venueName: venue?.fullName ?? null,
      city: venue?.address?.city ?? null,
      country: venue?.address?.country ?? null,
      fights,
    }
  }

  private mapCompetition(c: EspnCompetition, eventDate: Date): ScoreboardFightDTO {
    const fighters = (c.competitors ?? [])
      .filter((comp) => comp.id && (comp.athlete?.displayName || comp.athlete?.fullName))
      .map((comp) => {
        const record = (comp.records ?? []).find((r) => r.type === 'total') ?? comp.records?.[0]
        return {
          externalId: `espn:athlete:${comp.id}`,
          fullName: comp.athlete?.displayName ?? (comp.athlete?.fullName as string),
          recordAtFight: record?.summary ?? null,
          isWinner: comp.winner === true ? true : comp.winner === false ? false : null,
          corner: comp.order ?? null,
        }
      })
    const date = c.date ? new Date(c.date) : eventDate
    return {
      externalId: `espn:competition:${c.id}`,
      status: mapEspnStatus(c.status?.type, date),
      rawStatus: c.status?.type?.state ?? null,
      date,
      fighters,
    }
  }

  /** Détail d'un combat (catégorie, rounds, segment, résultat). */
  async getFightDetail(org: Organization, espnEventId: string, espnCompetitionId: string): Promise<FightDetailDTO | null> {
    const league = ESPN_LEAGUES[org]
    const base = `${CORE_LEAGUES}/${league}/events/${espnEventId}/competitions/${espnCompetitionId}`
    const comp = await providerFetchJson<CoreCompetition>('espn-core', `${base}?lang=en&region=us`, {
      cacheKey: `espn:core:competition:${espnCompetitionId}`,
      ttlMs: CACHE_TTL.competition,
    })
    if (!comp) return null

    // Le statut détaillé (avec résultat et durée) vit sur un endpoint dédié.
    const status = await providerFetchJson<EspnStatus>(
      'espn-core',
      `${base}/status?lang=en&region=us`,
      { cacheKey: `espn:core:competition-status:${espnCompetitionId}`, ttlMs: CACHE_TTL.competition }
    )

    const date = comp.date ? new Date(comp.date) : new Date()
    const mappedStatus = mapEspnStatus(status?.type ?? comp.status?.type, date)
    const { method, detail } = resultMethodDetail(status?.result ?? null)
    return {
      externalId: `espn:competition:${espnCompetitionId}`,
      weightClass: comp.type?.text ?? null,
      scheduledRounds: comp.format?.regulation?.periods ?? null,
      cardSegment: comp.cardSegment?.description ?? null,
      matchNumber: comp.matchNumber ?? null,
      status: mappedStatus,
      rawStatus: status?.type?.state ?? comp.status?.type?.state ?? null,
      durationSeconds: mappedStatus === 'TERMINE' ? fightDurationSeconds(status ?? null) : null,
      resultMethod: mappedStatus === 'TERMINE' ? method : null,
      resultDetail: mappedStatus === 'TERMINE' ? detail : null,
      winnerExternalId: null, // rempli par le service de synchronisation via le scoreboard
    }
  }

  /** Fiche biographique d'un combattant. */
  async getFighterProfile(espnAthleteId: string): Promise<FighterProfileDTO | null> {
    const a = await providerFetchJson<CoreAthlete>('espn-core', `${CORE}/athletes/${espnAthleteId}?lang=en&region=us`, {
      cacheKey: `espn:core:athlete:${espnAthleteId}`,
      ttlMs: CACHE_TTL.athlete,
    })
    if (!a) return null
    return {
      externalId: `espn:athlete:${espnAthleteId}`,
      fullName: a.fullName ?? null,
      nickname: a.nickname ?? null,
      birthDate: a.dateOfBirth ?? null,
      nationality: a.citizenship ?? null,
      heightInches: a.height ?? null,
      reachInches: a.reach ?? null,
      weightLbs: a.weight ?? null,
      weightClass: a.weightClass?.text ?? null,
      stance: a.stance?.text ?? null,
      fightingStyle: a.styles?.[0]?.text ?? null,
      active: a.status?.type ? a.status.type === 'active' : null,
      imageUrl: a.headshot?.href ?? null,
      flagUrl: a.flag?.href ?? null,
    }
  }

  /** Statistiques de carrière (SLpM, précision, takedowns, soumissions...). */
  async getFighterStats(espnAthleteId: string): Promise<FighterStatsDTO | null> {
    const data = await providerFetchJson<CoreStatistics>(
      'espn-core',
      `${CORE}/athletes/${espnAthleteId}/statistics?lang=en&region=us`,
      { cacheKey: `espn:core:athlete-stats:${espnAthleteId}`, ttlMs: CACHE_TTL.athleteStats }
    )
    if (!data) return null
    const items = (data.splits?.categories ?? []).flatMap((c) => c.stats ?? [])
    const get = (name: string): number | null => {
      const it = items.find((s) => s.name === name)
      if (!it || it.value == null || !Number.isFinite(Number(it.value))) return null
      return Number(it.value)
    }
    return {
      sigStrikesLandedPerMin: get('strikeLPM'),
      strikingAccuracy: get('strikeAccuracy'),
      takedownsPer15Min: get('takedownAvg'),
      takedownAccuracy: get('takedownAccuracy'),
      submissionsPer15Min: get('submissionAvg'),
      koPercentage: get('koPercentage'),
      tkoPercentage: get('tkoPercentage'),
      decisionPercentage: get('decisionPercentage'),
    }
  }

  /** Palmarès détaillé (victoires par méthode, combats de titre). */
  async getFighterRecord(espnAthleteId: string): Promise<FighterRecordDTO | null> {
    const data = await providerFetchJson<CoreRecord>(
      'espn-core',
      `${CORE}/athletes/${espnAthleteId}/records/0?lang=en&region=us`,
      { cacheKey: `espn:core:athlete-records:${espnAthleteId}`, ttlMs: CACHE_TTL.athleteStats }
    )
    if (!data?.stats) return null
    const get = (name: string): number | null => {
      const it = data.stats?.find((s) => s.name === name)
      if (!it || it.value == null || !Number.isFinite(Number(it.value))) return null
      return Number(it.value)
    }
    return {
      wins: get('wins'),
      losses: get('losses'),
      draws: get('draws'),
      noContests: get('noContests'),
      winsByKo: get('tkos'),
      winsBySub: get('submissions'),
      titleWins: get('titleWins'),
    }
  }

  /** Historique des combats (résultats, adversaires). */
  async getFighterHistory(espnAthleteId: string): Promise<FightHistoryEntryDTO[]> {
    const data = await providerFetchJson<CommonV3Athlete>(
      'espn',
      `${COMMON_V3}/athletes/${espnAthleteId}`,
      { cacheKey: `espn:common:athlete-history:${espnAthleteId}`, ttlMs: CACHE_TTL.athleteHistory }
    )
    const entries = Object.values(data?.eventsMap ?? {})
    return entries
      .filter((e) => e.gameDate && e.gameResult && e.opponent?.displayName && e.uid)
      .map((e) => {
        const uid = e.uid as string
        const parts = parseFightUid(uid)
        return {
          externalFightKey: `espn:uid:${uid}`,
          espnEventId: parts?.eventId ?? null,
          espnCompetitionId: parts?.competitionId ?? null,
          espnLeagueId: parts?.leagueId ?? null,
          eventName: e.name ?? null,
          eventDate: new Date(e.gameDate as string),
          result: (e.gameResult as string).toUpperCase(),
          opponentName: e.opponent?.displayName as string,
          opponentExternalId: e.opponent?.id ? `espn:athlete:${e.opponent.id}` : null,
          titleFight: e.titleFight === true,
        }
      })
  }

  /** Statistiques détaillées d'un combattant dans un combat donné (combats terminés). */
  async getFightStatsFor(
    espnEventId: string,
    espnCompetitionId: string,
    espnAthleteId: string,
    league = 'ufc'
  ): Promise<FightStatsBreakdown | null> {
    const url = `${CORE_LEAGUES}/${league}/events/${espnEventId}/competitions/${espnCompetitionId}/competitors/${espnAthleteId}/statistics?lang=en&region=us`
    const data = await providerFetchJson<CoreStatistics>('espn-core', url, {
      cacheKey: `espn:core:fight-stats:${espnCompetitionId}:${espnAthleteId}`,
      ttlMs: CACHE_TTL.competition,
    })
    if (!data) return null
    const items = (data.splits?.categories ?? []).flatMap((c) => c.stats ?? [])
    const num = (name: string): number | null => {
      const it = items.find((s) => s.name === name)
      if (!it || it.value == null || !Number.isFinite(Number(it.value))) return null
      return Number(it.value)
    }
    // temps de contrôle au format "m:ss"
    const control = items.find((s) => s.name === 'timeInControl')?.displayValue
    let controlSeconds: number | null = null
    if (control) {
      const m = control.match(/^(\d+):(\d{2})$/)
      if (m) controlSeconds = Number(m[1]) * 60 + Number(m[2])
    }
    return {
      sigStrikesLanded: num('sigStrikesLanded'),
      sigStrikesAttempted: num('sigStrikesAttempted'),
      takedownsLanded: num('takedownsLanded'),
      takedownsAttempted: num('takedownsAttempted'),
      submissions: num('submissions'),
      knockdowns: num('knockDowns'),
      controlSeconds,
    }
  }

  /** Statut détaillé d'un combat (durée + méthode de victoire). */
  async getFightStatus(org: Organization, espnEventId: string, espnCompetitionId: string): Promise<{
    durationSeconds: number | null
    resultMethod: ReturnType<typeof mapResultMethod>
    resultDetail: string | null
  } | null> {
    const league = ESPN_LEAGUES[org]
    return this.getCompetitionStatus(league, espnEventId, espnCompetitionId)
  }

  /**
   * Statut d'une compétition par code de ligue (ufc/pfl/bellator) — utilisé
   * pour les combats d'historique inter-organisations.
   * Retourne la durée calculée et la méthode de victoire.
   */
  async getCompetitionStatus(
    league: string,
    espnEventId: string,
    espnCompetitionId: string
  ): Promise<{
    durationSeconds: number | null
    resultMethod: ReturnType<typeof mapResultMethod>
    resultDetail: string | null
    raw: { clock: number | null; period: number | null }
  } | null> {
    const url = `${CORE_LEAGUES}/${league}/events/${espnEventId}/competitions/${espnCompetitionId}/status?lang=en&region=us`
    const status = await providerFetchJson<EspnStatus>('espn-core', url, {
      cacheKey: `espn:core:competition-status:${espnCompetitionId}`,
      ttlMs: CACHE_TTL.competition,
    })
    if (!status) return null
    const { method, detail } = resultMethodDetail(status.result ?? null)
    return {
      durationSeconds: fightDurationSeconds(status),
      resultMethod: method,
      resultDetail: detail,
      raw: { clock: status.clock ?? null, period: status.period ?? null },
    }
  }
}

export const espnProvider = new EspnMmaProvider()

/** Extrait les identifiants ESPN bruts depuis les clés externes VOLTRIX. */
export function parseExternalIds(externalId: string): {
  kind: string
  espnId: string
  org?: Organization
} | null {
  const parts = externalId.split(':')
  if (parts[0] !== 'espn') return null
  // espn:athlete:{id} | espn:competition:{id}
  if (parts.length === 3 && (parts[1] === 'athlete' || parts[1] === 'competition')) {
    return { kind: parts[1], espnId: parts[2] }
  }
  // espn:{org}:event:{id} (ex: espn:ufc:event:600061400)
  if (parts.length === 4 && parts[2] === 'event') {
    return { kind: 'event', espnId: parts[3], org: parts[1].toUpperCase() as Organization }
  }
  return null
}

/** Utilitaire : palmarès texte depuis les records ESPN du scoreboard. */
export function recordSummaryFromEspn(records: EspnRecord[] | undefined): string | null {
  const total = records?.find((r) => r.type === 'total')
  return total?.summary ?? null
}
