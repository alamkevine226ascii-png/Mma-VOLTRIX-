'use client'

/** Types côté client pour les réponses API du module MMA. */

export interface MmaEventListItem {
  id: string
  name: string
  shortName: string | null
  organization: string
  date: string
  status: string
  venue: string | null
  city: string | null
  country: string | null
  fightsCount: number
  mainEvent: string | null
  detailsSynced: boolean
  lastSyncedAt: string
}

export interface MmaEventsResponse {
  events: MmaEventListItem[]
  lastSyncAt: string | null
  syncStatus: string | null
}

export interface MmaEventFighter {
  id: string
  externalId: string
  fullName: string
  nickname: string | null
  imageUrl: string | null
  flagUrl: string | null
  recordAtFight: string | null
  wins: number | null
  losses: number | null
  draws: number | null
  lastResults: string | null
  isWinner: boolean | null
  profileSynced: boolean
}

export interface MmaEventFight {
  id: string
  weightClass: string | null
  weightClassFr: string | null
  scheduledRounds: number | null
  cardSegment: string | null
  matchNumber: number | null
  status: string
  resultMethod: string | null
  resultDetail: string | null
  durationSeconds: number | null
  winnerExternalId: string | null
  fighters: MmaEventFighter[]
}

export interface MmaEventDetail {
  id: string
  name: string
  shortName: string | null
  organization: string
  date: string
  status: string
  venue: string | null
  city: string | null
  country: string | null
  lastSyncedAt: string
  fights: MmaEventFight[]
}

export interface FighterView {
  id: string
  fullName: string
  nickname: string | null
  imageUrl: string | null
  flagUrl: string | null
  nationality: string | null
  birthDate: string | null
  age: number | null
  heightCm: number | null
  reachCm: number | null
  weightLbs: number | null
  weightClass: string | null
  stance: string | null
  fightingStyle: string | null
  record: {
    wins: number | null
    losses: number | null
    draws: number | null
    noContests: number | null
    winsByKo: number | null
    winsBySub: number | null
  }
  lastResults: string[]
  totalFights: number | null
  stats: {
    sigStrikesLandedPerMin: number | null
    strikingAccuracy: number | null
    takedownsPer15Min: number | null
    takedownAccuracy: number | null
    submissionsPer15Min: number | null
    koPercentage: number | null
    tkoPercentage: number | null
    decisionPercentage: number | null
    syncedAt: string | null
  } | null
  derived: {
    windowSize: number
    sigStrikesAbsorbedPerMin: number | null
    strikingDefense: number | null
    takedownDefense: number | null
    avgFightSeconds: number | null
    fightsUsed: number
    fightsSkipped: number
    computedAt: string
  } | null
  recentHistory: {
    eventDate: string
    eventName: string | null
    result: string
    opponentName: string
    titleFight: boolean
  }[]
  sourceUrl: string | null
  lastSyncedAt: string
}

export interface ObservedRow {
  label: string
  valueA: string
  valueB: string
  kind: 'bio' | 'record' | 'career' | 'derived'
  origin: string
}

export interface DimensionScore {
  key: string
  label: string
  scoreA: number | null
  scoreB: number | null
  advantage: 'A' | 'B' | '=' | null
  detail: string
  basis: string
  available: boolean
}

export interface CommentaryBlock {
  title: string
  text: string
}

export interface FightAnalysis {
  fight: {
    id: string
    status: string
    weightClass: string | null
    scheduledRounds: number | null
    cardSegment: string | null
    resultMethod: string | null
    resultDetail: string | null
    winner: string | null
  }
  event: {
    id: string
    name: string
    organization: string
    date: string
    venue: string | null
    city: string | null
    country: string | null
  }
  fighters: [FighterView, FighterView]
  observed: ObservedRow[]
  dimensions: DimensionScore[]
  radar: { dimension: string; A: number | null; B: number | null }[]
  commentary: CommentaryBlock[]
  limitations: string[]
  sources: { name: string; url: string | null; detail: string; syncedAt: string }[]
  derivedPending: boolean
}

export const STATUS_LABELS: Record<string, string> = {
  PROGRAMME: 'Programmé',
  CONFIRME: 'Confirmé',
  REPORTE: 'Reporté',
  ANNULE: 'Annulé',
  TERMINE: 'Terminé',
  EN_COURS: 'En cours',
}

export const STATUS_CLASSES: Record<string, string> = {
  PROGRAMME: 'text-amber-200 bg-amber-400/10 border-amber-300/25',
  CONFIRME: 'text-emerald-200 bg-emerald-400/10 border-emerald-300/25',
  REPORTE: 'text-orange-200 bg-orange-400/10 border-orange-300/25',
  ANNULE: 'text-red-200 bg-red-400/10 border-red-300/25',
  TERMINE: 'text-zinc-300 bg-zinc-400/10 border-zinc-300/25',
  EN_COURS: 'text-rose-200 bg-rose-400/10 border-rose-300/25',
}

export const ORG_STYLES: Record<string, { label: string; badge: string }> = {
  UFC: { label: 'UFC', badge: 'text-rose-200 bg-rose-500/15 border-rose-400/30' },
  PFL: { label: 'PFL', badge: 'text-emerald-200 bg-emerald-500/15 border-emerald-400/30' },
  BELLATOR: { label: 'Bellator', badge: 'text-amber-200 bg-amber-500/15 border-amber-400/30' },
}

export const RESULT_LABELS: Record<string, string> = {
  W: 'V',
  L: 'D',
  D: 'N',
  NC: 'NC',
}
