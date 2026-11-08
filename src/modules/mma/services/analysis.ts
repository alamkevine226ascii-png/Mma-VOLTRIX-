/**
 * MODULE MMA — Moteur d'analyse statistique.
 *
 * Principes (exigences VOLTRIX) :
 *  1. Données observées et interprétations STRICTEMENT séparées.
 *  2. Une statistique manquante est affichée "Non disponible", jamais estimée.
 *  3. Les indicateurs non fournis par la source (frappes reçues/minute,
 *     défenses, temps moyen) sont CALCULÉS à partir des statistiques par
 *     combat sur une fenêtre explicite (par défaut 10 combats), et étiquetés
 *     comme tels avec leur date de calcul.
 *  4. Le pronostic (prediction.ts) est un service distinct : il agrège les
 *     dimensions observées en une probabilité bornée et documentée ; il
 *     n'invente jamais de donnée et refuse de trancher sans base suffisante.
 *
 * Normalisation des avantages : pour un indicateur où "plus haut = mieux",
 * score A = A / (A + B) * 100. Pour "plus bas = mieux" (absorption), la
 * formule est inversée. Cette normalisation relative quantifie l'écart
 * observé entre les deux combattants.
 */
import { db } from '@/lib/db'
import {
  espnProvider,
  ESPN_LEAGUE_UIDS,
  parseExternalIds,
} from '@/modules/mma/providers/espn'
import { fightDurationSeconds, formScore } from '@/modules/mma/types'
import { enrichEvent, enrichFighter } from '@/modules/mma/services/sync'
import { computePrediction, type PredictionView } from '@/modules/mma/services/prediction'

export const DERIVED_WINDOW = 10

// ---------------------------------------------------------------------------
// Vues sérialisables pour l'API
// ---------------------------------------------------------------------------

export interface FighterView {
  id: string
  externalId: string
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
  record: { wins: number | null; losses: number | null; draws: number | null; noContests: number | null; winsByKo: number | null; winsBySub: number | null }
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
  origin: string // "ESPN — fiche combattant" / "Calculé sur les N derniers combats"
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
  prediction: PredictionView
  limitations: string[]
  sources: { name: string; url: string | null; detail: string; syncedAt: string }[]
  derivedPending: boolean
}

// ---------------------------------------------------------------------------
// Statistiques dérivées (calculées, fenêtre explicite)
// ---------------------------------------------------------------------------

export async function computeDerivedStats(fighterId: string, windowSize = DERIVED_WINDOW): Promise<boolean> {
  const fighter = await db.mmaFighter.findUnique({
    where: { id: fighterId },
    include: { history: true },
  })
  if (!fighter) return false
  const parsed = parseExternalIds(fighter.externalId)
  if (!parsed || parsed.kind !== 'athlete') return false

  const usable = fighter.history
    .filter(
      (h) =>
        h.espnEventId &&
        h.espnCompetitionId &&
        h.espnLeagueId &&
        h.opponentExternalId &&
        ESPN_LEAGUE_UIDS[h.espnLeagueId]
    )
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
    .slice(0, windowSize)

  if (usable.length === 0) return false

  let oppSigLanded = 0
  let oppSigAttempted = 0
  let oppTdl = 0
  let oppTda = 0
  let totalSeconds = 0
  let fightsUsed = 0
  let fightsSkipped = 0
  const usedKeys: string[] = []

  for (const h of usable) {
    const league = ESPN_LEAGUE_UIDS[h.espnLeagueId as string]
    const oppParsed = parseExternalIds(h.opponentExternalId as string)
    if (!oppParsed || oppParsed.kind !== 'athlete') {
      fightsSkipped++
      continue
    }
    try {
      const [oppStats, status] = await Promise.all([
        espnProvider.getFightStatsFor(h.espnEventId as string, h.espnCompetitionId as string, oppParsed.espnId, league),
        espnProvider.getCompetitionStatus(league, h.espnEventId as string, h.espnCompetitionId as string),
      ])
      const duration = status ? fightDurationSeconds(status.raw) : null
      const ok =
        oppStats?.sigStrikesLanded != null &&
        oppStats?.sigStrikesAttempted != null &&
        duration != null &&
        duration > 0
      if (!ok) {
        fightsSkipped++
        continue
      }
      oppSigLanded += oppStats?.sigStrikesLanded ?? 0
      oppSigAttempted += oppStats?.sigStrikesAttempted ?? 0
      oppTdl += oppStats?.takedownsLanded ?? 0
      oppTda += oppStats?.takedownsAttempted ?? 0
      totalSeconds += duration
      fightsUsed++
      usedKeys.push(h.externalFightKey)
    } catch {
      fightsSkipped++
    }
  }

  if (fightsUsed === 0 || totalSeconds === 0) return false

  const totalMinutes = totalSeconds / 60
  const sapm = oppSigLanded / totalMinutes
  const strikeDef = oppSigAttempted > 0 ? (1 - oppSigLanded / oppSigAttempted) * 100 : null
  const tdDef = oppTda > 0 ? (1 - oppTdl / oppTda) * 100 : null

  await db.mmaDerivedStats.upsert({
    where: { fighterId_windowSize: { fighterId, windowSize } },
    create: {
      fighterId,
      windowSize,
      sigStrikesAbsorbedPerMin: round2(sapm),
      strikingDefense: strikeDef == null ? null : round2(strikeDef),
      takedownDefense: tdDef == null ? null : round2(tdDef),
      avgFightSeconds: Math.round(totalSeconds / fightsUsed),
      computedFrom: JSON.stringify({ used: usedKeys, skipped: fightsSkipped }),
      computedAt: new Date(),
    },
    update: {
      sigStrikesAbsorbedPerMin: round2(sapm),
      strikingDefense: strikeDef == null ? null : round2(strikeDef),
      takedownDefense: tdDef == null ? null : round2(tdDef),
      avgFightSeconds: Math.round(totalSeconds / fightsUsed),
      computedFrom: JSON.stringify({ used: usedKeys, skipped: fightsSkipped }),
      computedAt: new Date(),
    },
  })
  return true
}

/** Lance le calcul dérivé en arrière-plan (sans attendre). */
export function kickOffDerivedComputation(fighterIds: string[]): void {
  for (const fid of fighterIds) {
    void computeDerivedStats(fid).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Analyse d'un combat
// ---------------------------------------------------------------------------

export async function getFightAnalysis(fightId: string): Promise<FightAnalysis | { error: string }> {
  const fight = await db.mmaFight.findUnique({
    where: { id: fightId },
    include: {
      event: true,
      fighters: { include: { fighter: { include: { stats: true, derived: true, history: true } } } },
    },
  })
  if (!fight) return { error: 'Combat introuvable' }

  // Enrichissement à la demande (borné) : détails du combat seul + fiches
  if (!fight.event.detailsSynced) {
    await enrichEvent(fight.eventId, { fightIds: [fight.id] }).catch(() => undefined)
  }
  for (const ff of fight.fighters) {
    if (!ff.fighter.profileSynced) {
      await enrichFighter(ff.fighterId).catch(() => undefined)
    }
  }

  const fresh = await db.mmaFight.findUnique({
    where: { id: fightId },
    include: {
      event: true,
      fighters: {
        include: { fighter: { include: { stats: true, derived: true, history: true } } },
        orderBy: { corner: 'asc' },
      },
    },
  })
  if (!fresh) return { error: 'Combat introuvable' }
  const [fa, fb] = fresh.fighters.map((ff) => ff.fighter)
  if (!fa || !fb) return { error: 'Combat incomplet : combattants manquants' }

  const viewA = toFighterView(fa)
  const viewB = toFighterView(fb)

  const observed = buildObservedTable(viewA, viewB)
  const dimensions = buildDimensions(viewA, viewB)
  const radar = dimensions
    .filter((d) => d.available && ['volume', 'precision', 'absorption', 'lutte', 'sol', 'forme'].includes(d.key))
    .map((d) => ({ dimension: d.label, A: d.scoreA, B: d.scoreB }))
  const prediction = computePrediction(viewA, viewB, dimensions)

  const derivedPending =
    (fa.stats != null && fa.derived.length === 0) || (fb.stats != null && fb.derived.length === 0)
  if (derivedPending) {
    kickOffDerivedComputation([fa.id, fb.id].filter((id) => {
      const f = id === fa.id ? fa : fb
      return f.stats != null && f.derived.length === 0
    }))
  }

  return {
    fight: {
      id: fresh.id,
      status: fresh.status,
      weightClass: fresh.weightClass,
      scheduledRounds: fresh.scheduledRounds,
      cardSegment: fresh.cardSegment,
      resultMethod: fresh.resultMethod,
      resultDetail: fresh.resultDetail,
      winner: fresh.winnerExternalId,
    },
    event: {
      id: fresh.event.id,
      name: fresh.event.name,
      organization: fresh.event.organization,
      date: fresh.event.date.toISOString(),
      venue: fresh.event.venueName,
      city: fresh.event.city,
      country: fresh.event.country,
    },
    fighters: [viewA, viewB],
    observed,
    dimensions,
    radar,
    commentary: buildCommentary(viewA, viewB, dimensions, fresh.weightClass),
    prediction,
    limitations: buildLimitations(viewA, viewB),
    sources: buildSources(viewA, viewB, fresh.event.name),
    derivedPending,
  }
}

// ---------------------------------------------------------------------------
// Construction des vues
// ---------------------------------------------------------------------------

function calcAge(birth: Date | null): number | null {
  if (!birth) return null
  const now = new Date()
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const m = now.getUTCMonth() - birth.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--
  return age >= 15 && age <= 60 ? age : null // garde-fou : date aberrante -> non disponible
}

type FighterWithRelations = NonNullable<
  Awaited<ReturnType<typeof loadFighter>>
>

export type { FighterWithRelations }

async function loadFighter(id: string) {
  return db.mmaFighter.findUnique({
    where: { id },
    include: { stats: true, derived: true, history: true },
  })
}

export function toFighterView(f: FighterWithRelations): FighterView {
  const derived = f.derived.find((d) => d.windowSize === DERIVED_WINDOW) ?? null
  const history = [...f.history].sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
  const totalFights =
    f.wins != null || f.losses != null
      ? (f.wins ?? 0) + (f.losses ?? 0) + (f.draws ?? 0) + (f.noContests ?? 0)
      : null
  return {
    id: f.id,
    externalId: f.externalId,
    fullName: f.fullName,
    nickname: f.nickname,
    imageUrl: f.imageUrl,
    flagUrl: f.flagUrl,
    nationality: f.nationality,
    birthDate: f.birthDate ? f.birthDate.toISOString() : null,
    age: calcAge(f.birthDate),
    heightCm: f.heightCm,
    reachCm: f.reachCm,
    weightLbs: f.weightLbs,
    weightClass: f.weightClass,
    stance: f.stance,
    fightingStyle: f.fightingStyle,
    record: {
      wins: f.wins,
      losses: f.losses,
      draws: f.draws,
      noContests: f.noContests,
      winsByKo: f.winsByKo,
      winsBySub: f.winsBySub,
    },
    lastResults: f.lastResults ? f.lastResults.split(',').filter(Boolean) : [],
    totalFights,
    stats: f.stats
      ? {
          sigStrikesLandedPerMin: f.stats.sigStrikesLandedPerMin,
          strikingAccuracy: f.stats.strikingAccuracy,
          takedownsPer15Min: f.stats.takedownsPer15Min,
          takedownAccuracy: f.stats.takedownAccuracy,
          submissionsPer15Min: f.stats.submissionsPer15Min,
          koPercentage: f.stats.koPercentage,
          tkoPercentage: f.stats.tkoPercentage,
          decisionPercentage: f.stats.decisionPercentage,
          syncedAt: f.stats.syncedAt.toISOString(),
        }
      : null,
    derived: derived
      ? {
          windowSize: derived.windowSize,
          sigStrikesAbsorbedPerMin: derived.sigStrikesAbsorbedPerMin,
          strikingDefense: derived.strikingDefense,
          takedownDefense: derived.takedownDefense,
          avgFightSeconds: derived.avgFightSeconds,
          fightsUsed: (JSON.parse(derived.computedFrom ?? '{}') as { used?: string[] }).used?.length ?? 0,
          fightsSkipped: (JSON.parse(derived.computedFrom ?? '{}') as { skipped?: number }).skipped ?? 0,
          computedAt: derived.computedAt.toISOString(),
        }
      : null,
    recentHistory: history.slice(0, 10).map((h) => ({
      eventDate: h.eventDate.toISOString(),
      eventName: h.eventName,
      result: h.result,
      opponentName: h.opponentName,
      titleFight: h.titleFight === true,
    })),
    sourceUrl: f.sourceUrl,
    lastSyncedAt: f.lastSyncedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Tableau des données observées
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, unit = '', digits = 2): string {
  if (n == null || !Number.isFinite(n)) return 'Non disponible'
  const v = digits === 0 ? String(Math.round(n)) : n.toFixed(digits).replace(/\.?0+$/, '')
  return `${v}${unit ? ` ${unit}` : ''}`
}

function buildObservedTable(a: FighterView, b: FighterView): ObservedRow[] {
  const rows: ObservedRow[] = []
  const push = (label: string, va: string, vb: string, kind: ObservedRow['kind'], origin: string) =>
    rows.push({ label, valueA: va, valueB: vb, kind, origin })

  // Fiche
  push('Âge', a.age != null ? `${a.age} ans` : 'Non disponible', b.age != null ? `${b.age} ans` : 'Non disponible', 'bio', 'ESPN · fiche (âge calculé)')
  push('Taille', fmt(a.heightCm, 'cm', 1), fmt(b.heightCm, 'cm', 1), 'bio', 'ESPN · fiche (pouces → cm)')
  push('Allonge', fmt(a.reachCm, 'cm', 1), fmt(b.reachCm, 'cm', 1), 'bio', 'ESPN · fiche (pouces → cm)')
  push('Garde', a.stance ?? 'Non disponible', b.stance ?? 'Non disponible', 'bio', 'ESPN · fiche combattant')
  push('Catégorie', a.weightClass ?? 'Non disponible', b.weightClass ?? 'Non disponible', 'bio', 'ESPN · fiche combattant')

  // Palmarès
  push('Palmarès (V-D-N)',
    a.record.wins != null ? `${a.record.wins}-${a.record.losses ?? '?'}-${a.record.draws ?? '?'}` : 'Non disponible',
    b.record.wins != null ? `${b.record.wins}-${b.record.losses ?? '?'}-${b.record.draws ?? '?'}` : 'Non disponible',
    'record', 'ESPN · palmarès officiel')
  push('Combat sans décision', String(a.record.noContests ?? 'Non disponible'), String(b.record.noContests ?? 'Non disponible'), 'record', 'ESPN · palmarès officiel')
  push('Victoires par KO/TKO', String(a.record.winsByKo ?? 'Non disponible'), String(b.record.winsByKo ?? 'Non disponible'), 'record', 'ESPN · palmarès officiel')
  push('Victoires par soumission', String(a.record.winsBySub ?? 'Non disponible'), String(b.record.winsBySub ?? 'Non disponible'), 'record', 'ESPN · palmarès officiel')
  push('Forme (5 derniers)',
    a.lastResults.length ? formFr(a.lastResults) : 'Non disponible',
    b.lastResults.length ? formFr(b.lastResults) : 'Non disponible',
    'record', 'ESPN · historique des combats')

  // Stats de carrière
  const sA = a.stats
  const sB = b.stats
  const career = 'ESPN · stats de carrière'
  push('Frappes significatives portées / min', fmt(sA?.sigStrikesLandedPerMin), fmt(sB?.sigStrikesLandedPerMin), 'career', career)
  push('Précision des frappes', fmt(sA?.strikingAccuracy, '%', 1), fmt(sB?.strikingAccuracy, '%', 1), 'career', career)
  push('Takedowns réussis / 15 min', fmt(sA?.takedownsPer15Min), fmt(sB?.takedownsPer15Min), 'career', career)
  push('Précision des takedowns', fmt(sA?.takedownAccuracy, '%', 1), fmt(sB?.takedownAccuracy, '%', 1), 'career', career)
  push('Soumissions tentées / 15 min', fmt(sA?.submissionsPer15Min), fmt(sB?.submissionsPer15Min), 'career', career)

  // Dérivés
  const dA = a.derived
  const dB = b.derived
  const derivedLabel = `Calcul VOLTRIX · ${DERIVED_WINDOW} derniers combats (stats par combat ESPN)`
  push('Frappes significatives reçues / min', fmt(dA?.sigStrikesAbsorbedPerMin), fmt(dB?.sigStrikesAbsorbedPerMin), 'derived', derivedLabel)
  push('Défense contre les frappes', fmt(dA?.strikingDefense, '%', 1), fmt(dB?.strikingDefense, '%', 1), 'derived', derivedLabel)
  push('Défense contre les takedowns', fmt(dA?.takedownDefense, '%', 1), fmt(dB?.takedownDefense, '%', 1), 'derived', derivedLabel)
  push('Temps moyen de combat', dA?.avgFightSeconds != null ? formatDuration(dA.avgFightSeconds) : 'Non disponible', dB?.avgFightSeconds != null ? formatDuration(dB.avgFightSeconds) : 'Non disponible', 'derived', derivedLabel)
  return rows
}

/** Forme en notation française : V (victoire), N (nul), D (défaite), NC. */
export function formFr(results: string[]): string {
  const map: Record<string, string> = { W: 'V', L: 'D', D: 'N', NC: 'NC' }
  return results.map((r) => map[r] ?? r).join(' · ')
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Dimensions d'interprétation
// ---------------------------------------------------------------------------

function edge(a: number | null, b: number | null, lowerBetter = false): { scoreA: number | null; scoreB: number | null; advantage: 'A' | 'B' | '=' | null } {
  if (a == null || b == null) return { scoreA: null, scoreB: null, advantage: null }
  if (a === 0 && b === 0) return { scoreA: 50, scoreB: 50, advantage: '=' }
  const [x, y] = lowerBetter ? [b, a] : [a, b]
  const shareX = x + y === 0 ? 50 : (x / (x + y)) * 100
  const scoreA = lowerBetter ? 100 - shareX : shareX
  const scoreB = 100 - scoreA
  const advantage = Math.abs(scoreA - scoreB) < 6 ? '=' : scoreA > scoreB ? 'A' : 'B'
  return { scoreA: round2(scoreA), scoreB: round2(scoreB), advantage }
}

/** Construit les dimensions comparatives entre deux vues combattants (exporté pour le backtest). */
export function buildDimensions(a: FighterView, b: FighterView): DimensionScore[] {
  const dims: DimensionScore[] = []
  const add = (
    key: string,
    label: string,
    va: number | null,
    vb: number | null,
    detail: (sa: number | null, sb: number | null) => string,
    basis: string,
    lowerBetter = false
  ) => {
    const e = edge(va, vb, lowerBetter)
    dims.push({
      key,
      label,
      scoreA: e.scoreA,
      scoreB: e.scoreB,
      advantage: e.advantage,
      detail: detail(va, vb),
      basis,
      available: e.advantage !== null,
    })
  }

  const career = 'Carrière (ESPN)'
  const derivedBasis = `${DERIVED_WINDOW} derniers combats (calculé)`

  add('forme', 'Forme récente', formScore(a.lastResults.join(',') || null), formScore(b.lastResults.join(',') || null),
    (x, y) => `Forme sur 5 combats : ${pct(x)} contre ${pct(y)}`, 'Historique (ESPN)')

  add('volume', 'Volume de frappes', a.stats?.sigStrikesLandedPerMin ?? null, b.stats?.sigStrikesLandedPerMin ?? null,
    (x, y) => `${fmt(x)} frappe(s) significative(s) par minute contre ${fmt(y)}`, career)

  add('precision', 'Précision des frappes', a.stats?.strikingAccuracy ?? null, b.stats?.strikingAccuracy ?? null,
    (x, y) => `Précision : ${fmt(x, '%', 1)} contre ${fmt(y, '%', 1)}`, career)

  add('absorption', 'Frappes absorbées', a.derived?.sigStrikesAbsorbedPerMin ?? null, b.derived?.sigStrikesAbsorbedPerMin ?? null,
    (x, y) => `${fmt(x)} frappe(s) reçue(s) par minute contre ${fmt(y)} (moins = mieux)`, derivedBasis, true)

  add('defense-frappes', 'Défense contre les frappes', a.derived?.strikingDefense ?? null, b.derived?.strikingDefense ?? null,
    (x, y) => `Défense : ${fmt(x, '%', 1)} contre ${fmt(y, '%', 1)}`, derivedBasis)

  add('lutte', 'Lutte (takedowns)', a.stats?.takedownsPer15Min ?? null, b.stats?.takedownsPer15Min ?? null,
    (x, y) => `${fmt(x)} takedown(s) par 15 min contre ${fmt(y)}`, career)

  add('defense-takedown', 'Défense contre les takedowns', a.derived?.takedownDefense ?? null, b.derived?.takedownDefense ?? null,
    (x, y) => `Défense : ${fmt(x, '%', 1)} contre ${fmt(y, '%', 1)}`, derivedBasis)

  add('sol', 'Soumissions', a.stats?.submissionsPer15Min ?? null, b.stats?.submissionsPer15Min ?? null,
    (x, y) => `${fmt(x)} soumission(s) tentée(s) par 15 min contre ${fmt(y)}`, career)

  add('puissance', 'Pouvoir de finition', a.stats ? (a.stats.koPercentage ?? 0) + (a.stats.tkoPercentage ?? 0) : null,
    b.stats ? (b.stats.koPercentage ?? 0) + (b.stats.tkoPercentage ?? 0) : null,
    (x, y) => `${fmt(x, '%', 1)} des combats finis par KO/TKO contre ${fmt(y, '%', 1)}`, career)

  add('experience', 'Expérience', a.totalFights, b.totalFights,
    (x, y) => `${x ?? '?'} combat(s) disputé(s) contre ${y ?? '?'}`, 'Palmarès (ESPN)')

  add('physique', 'Envergure physique',
    a.reachCm != null && b.reachCm != null ? a.reachCm : null,
    a.reachCm != null && b.reachCm != null ? b.reachCm : null,
    (x, y) => `Allonge : ${fmt(x, 'cm', 1)} contre ${fmt(y, 'cm', 1)}`, 'Fiche (ESPN)')

  return dims
}

function pct(x: number | null | undefined): string {
  if (x == null) return 'non disponible'
  return `${Math.round(x * 100)} %`
}

// ---------------------------------------------------------------------------
// Commentaires et limites
// ---------------------------------------------------------------------------

function buildCommentary(a: FighterView, b: FighterView, dims: DimensionScore[], weightClass: string | null): CommentaryBlock[] {
  const blocks: CommentaryBlock[] = []
  const nameA = a.fullName
  const nameB = b.fullName

  const advA = dims.filter((d) => d.advantage === 'A')
  const advB = dims.filter((d) => d.advantage === 'B')
  blocks.push({
    title: 'Lecture d\'ensemble',
    text: `Sur les ${dims.filter((d) => d.available).length} dimensions comparables (sur ${dims.length}), ${nameA} présente un écart statistique favorable sur ${advA.length} et ${nameB} sur ${advB.length}${weightClass ? `, en ${weightClass}` : ''}. Ces écarts reflètent les données observées ci-dessus ; ils ne préjugent pas du déroulement du combat.`,
  })

  for (const d of dims) {
    if (!d.available || d.advantage === '=' || d.advantage === null) continue
    const winner = d.advantage === 'A' ? nameA : nameB
    const loser = d.advantage === 'A' ? nameB : nameA
    const score = d.advantage === 'A' ? d.scoreA : d.scoreB
    blocks.push({
      title: d.label,
      text: `${d.detail}. Selon les données observées (${d.basis.toLowerCase()}), avantage statistique à ${winner} (indice relatif ${Math.round(score ?? 0)}/100). Cet écart est une lecture descriptive, pas une prédiction — l'adversaire ${loser} conserve des axes de jeu identifiés dans le tableau détaillé.`,
    })
  }

  // Styles
  const styleA = a.fightingStyle ?? 'style non documenté'
  const styleB = b.fightingStyle ?? 'style non documenté'
  const stanceA = a.stance ?? 'garde non documentée'
  const stanceB = b.stance ?? 'garde non documentée'
  blocks.push({
    title: 'Analyse des styles',
    text: `${nameA} est répertorié « ${styleA} » (${stanceA}) ; ${nameB} « ${styleB} » (${stanceB}). ${
      a.stance && b.stance && a.stance !== b.stance
        ? 'La différence de garde (orthodoxe contre gaucher ou alterné) produit classiquement des angles d\'attaque inhabituels pour les deux combattants.'
        : 'Les gardes identiques ou non documentées réduisent cet effet d\'angle.'
    } ${a.totalFights != null && b.totalFights != null && Math.abs((a.totalFights) - (b.totalFights)) > 8 ? `L\'écart d\'expérience (${a.totalFights} contre ${b.totalFights} combats) peut influer sur la gestion des phases critiques.` : 'Les expériences sont comparables.'}`,
  })
  return blocks
}

function buildLimitations(a: FighterView, b: FighterView): string[] {
  const lim: string[] = []
  const missingFor = (f: FighterView): string[] => {
    const m: string[] = []
    if (!f.stats) m.push('statistiques de carrière')
    if (!f.derived) m.push('indicateurs calculés (fenêtre 10 combats)')
    if (f.age == null) m.push('date de naissance')
    if (f.reachCm == null) m.push('allonge')
    if (f.heightCm == null) m.push('taille')
    if (f.lastResults.length === 0) m.push('forme récente')
    return m
  }
  for (const [f, label] of [[a, a.fullName], [b, b.fullName]] as const) {
    const m = missingFor(f)
    if (m.length) lim.push(`${label} : données non disponibles chez la source — ${m.join(', ')}.`)
  }
  if (a.derived && a.derived.fightsUsed < DERIVED_WINDOW) {
    lim.push(`${a.fullName} : indicateurs calculés sur ${a.derived.fightsUsed} combats seulement (fenêtre cible ${DERIVED_WINDOW}).`)
  }
  if (b.derived && b.derived.fightsUsed < DERIVED_WINDOW) {
    lim.push(`${b.fullName} : indicateurs calculés sur ${b.derived.fightsUsed} combats seulement (fenêtre cible ${DERIVED_WINDOW}).`)
  }
  lim.push('Les indices relatifs par dimension (0-100) comparent les deux combattants entre eux ; la probabilité du pronostic agrège ces dimensions dans un modèle pondéré distinct.')
  lim.push('Le pronostic est une estimation statistique bornée (25-75 %), pas une certitude ; aucune cote n\'est éditée.')
  return lim
}

function buildSources(a: FighterView, b: FighterView, eventName: string): FightAnalysis['sources'] {
  const src: FightAnalysis['sources'] = []
  src.push({
    name: 'ESPN — carte de l\'événement',
    url: null,
    detail: `Événement « ${eventName} » : combats, statuts, palmarès affichés`,
    syncedAt: new Date().toISOString(),
  })
  for (const f of [a, b]) {
    if (f.sourceUrl) {
      src.push({
        name: `ESPN — fiche ${f.fullName}`,
        url: f.sourceUrl,
        detail: 'Fiche combattant : biographie, palmarès, statistiques de carrière',
        syncedAt: f.lastSyncedAt,
      })
    }
    if (f.derived) {
      src.push({
        name: `VOLTRIX — calcul ${f.fullName}`,
        url: null,
        detail: `Frappes reçues/minute, défenses et temps moyen calculés sur ${f.derived.fightsUsed} combats terminés (stats par combat ESPN)`,
        syncedAt: f.derived.computedAt,
      })
    }
  }
  return src
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
