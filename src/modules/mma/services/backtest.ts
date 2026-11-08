/**
 * MODULE MMA — Vérification de fiabilité du pronostic (backtest).
 *
 * Principe : sur les combats TERMINÉS présents en base (données réelles
 * synchronisées depuis ESPN), recalculer le pronostic tel qu'il aurait été
 * émis, puis le confronter au vainqueur réel. Le taux de réussite est publié
 * tel quel dans l'application — y compris s'il est mauvais.
 *
 * Limites explicitement affichées :
 *  - biais de recul : les statistiques de carrière utilisées sont celles
 *    connues AUJOURD'HUI (fiche ESPN actuelle), pas celles au moment du
 *    combat ; le taux de réussite est donc indicatif ;
 *  - échantillon limité aux combats dont les deux combattants disposent de
 *    suffisamment de données ;
 *  - les combats trop serrés pour être départagés sont exclus du décompte.
 */
import { db } from '@/lib/db'
import { buildDimensions, toFighterView, type FighterView } from '@/modules/mma/services/analysis'
import { computePrediction, MODEL_VERSION } from '@/modules/mma/services/prediction'

export interface BacktestFightResult {
  fightId: string
  eventName: string | null
  date: string
  fighterA: string
  fighterB: string
  predictedFavorite: string
  probability: number
  actualWinner: string
  correct: boolean
  confidence: string
}

export interface BacktestResult {
  model: string
  analyzed: number
  correct: number
  accuracyPct: number | null
  byConfidence: { label: string; analyzed: number; correct: number }[]
  fights: BacktestFightResult[]
  skippedInsufficientData: number
  skippedTooClose: number
  notes: string[]
}

export async function backtestPredictions(limit = 80): Promise<BacktestResult> {
  const finished = await db.mmaFight.findMany({
    where: { status: 'TERMINE', winnerExternalId: { not: null } },
    include: {
      event: { select: { name: true } },
      fighters: {
        include: { fighter: { include: { stats: true, derived: true, history: true } } },
        orderBy: { corner: 'asc' },
      },
    },
    orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  const results: BacktestFightResult[] = []
  let skippedInsufficientData = 0
  let skippedTooClose = 0

  for (const fight of finished) {
    if (fight.fighters.length !== 2) {
      skippedInsufficientData++
      continue
    }
    const fa = fight.fighters[0].fighter
    const fb = fight.fighters[1].fighter
    if (!fa || !fb) {
      skippedInsufficientData++
      continue
    }
    const viewA: FighterView = toFighterView(fa)
    const viewB: FighterView = toFighterView(fb)
    const dimensions = buildDimensions(viewA, viewB)
    const prediction = computePrediction(viewA, viewB, dimensions)

    if (!prediction.available) {
      skippedInsufficientData++
      continue
    }
    if (prediction.favorite == null) {
      skippedTooClose++
      continue
    }
    const favoriteExternalId = prediction.favoriteExternalId
    if (!favoriteExternalId) {
      skippedInsufficientData++
      continue
    }
    const actualWinnerExternalId = fight.winnerExternalId as string
    results.push({
      fightId: fight.id,
      eventName: fight.event?.name ?? null,
      date: (fight.completedAt ?? fight.updatedAt).toISOString(),
      fighterA: viewA.fullName,
      fighterB: viewB.fullName,
      predictedFavorite: prediction.favoriteName ?? '?',
      probability: prediction.favorite === 'A' ? (prediction.probabilityA as number) : (prediction.probabilityB as number),
      actualWinner:
        actualWinnerExternalId === viewA.externalId
          ? viewA.fullName
          : actualWinnerExternalId === viewB.externalId
            ? viewB.fullName
            : '?',
      correct: favoriteExternalId === actualWinnerExternalId,
      confidence: prediction.confidence?.label ?? 'n/d',
    })
  }

  const analyzed = results.length
  const correct = results.filter((r) => r.correct).length
  const labels = ['Bonne', 'Moyenne', 'Limitée'] as const
  const byConfidence = labels.map((label) => {
    const subset = results.filter((r) => r.confidence === label)
    return {
      label,
      analyzed: subset.length,
      correct: subset.filter((r) => r.correct).length,
    }
  })

  return {
    model: MODEL_VERSION,
    analyzed,
    correct,
    accuracyPct: analyzed > 0 ? Math.round((correct / analyzed) * 100) : null,
    byConfidence,
    fights: results.slice(0, 15),
    skippedInsufficientData,
    skippedTooClose,
    notes: [
      'Biais de recul : les statistiques de carrière utilisées sont celles connues aujourd\'hui (fiches ESPN actuelles), pas celles au moment du combat — le taux de réussite est donc indicatif.',
      `Échantillon : ${analyzed} combats terminés départageables sur les ${limit} plus récents consultés.`,
      'Les combats jugés trop serrés pour être départagés sont exclus du décompte.',
    ],
  }
}
