/**
 * MODULE MMA — Route : GET /api/mma/fighters/[id]
 * Fiche détaillée d'un combattant : biographie, palmarès, statistiques de
 * carrière (sourcées et datées), historique des combats, forme récente.
 * Déclenche l'enrichissement à la demande si la fiche n'est pas synchronisée.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { enrichFighter } from '@/modules/mma/services/sync'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let fighter = await db.mmaFighter.findUnique({
    where: { id },
    include: { stats: true, history: true },
  })
  if (!fighter) {
    return NextResponse.json({ error: 'Combattant introuvable' }, { status: 404 })
  }
  if (!fighter.profileSynced) {
    await enrichFighter(fighter.id).catch(() => undefined)
    fighter = await db.mmaFighter.findUnique({
      where: { id },
      include: { stats: true, history: true },
    })
    if (!fighter) return NextResponse.json({ error: 'Combattant introuvable' }, { status: 404 })
  }

  const history = [...fighter.history].sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
  const totalFights =
    fighter.wins != null || fighter.losses != null
      ? (fighter.wins ?? 0) + (fighter.losses ?? 0) + (fighter.draws ?? 0) + (fighter.noContests ?? 0)
      : null

  return NextResponse.json({
    fighter: {
      id: fighter.id,
      fullName: fighter.fullName,
      nickname: fighter.nickname,
      imageUrl: fighter.imageUrl,
      flagUrl: fighter.flagUrl,
      nationality: fighter.nationality,
      birthDate: fighter.birthDate?.toISOString() ?? null,
      heightCm: fighter.heightCm,
      reachCm: fighter.reachCm,
      weightLbs: fighter.weightLbs,
      weightClass: fighter.weightClass,
      stance: fighter.stance,
      fightingStyle: fighter.fightingStyle,
      active: fighter.active,
      record: {
        wins: fighter.wins,
        losses: fighter.losses,
        draws: fighter.draws,
        noContests: fighter.noContests,
        winsByKo: fighter.winsByKo,
        winsBySub: fighter.winsBySub,
        titleWins: fighter.titleWins,
        totalFights,
      },
      lastResults: fighter.lastResults?.split(',').filter(Boolean) ?? [],
      stats: fighter.stats
        ? {
            sigStrikesLandedPerMin: fighter.stats.sigStrikesLandedPerMin,
            strikingAccuracy: fighter.stats.strikingAccuracy,
            takedownsPer15Min: fighter.stats.takedownsPer15Min,
            takedownAccuracy: fighter.stats.takedownAccuracy,
            submissionsPer15Min: fighter.stats.submissionsPer15Min,
            koPercentage: fighter.stats.koPercentage,
            tkoPercentage: fighter.stats.tkoPercentage,
            decisionPercentage: fighter.stats.decisionPercentage,
            sourceUrl: fighter.stats.sourceUrl,
            syncedAt: fighter.stats.syncedAt.toISOString(),
          }
        : null,
      history: history.slice(0, 20).map((h) => ({
        eventDate: h.eventDate.toISOString(),
        eventName: h.eventName,
        result: h.result,
        opponentName: h.opponentName,
        titleFight: h.titleFight,
      })),
      historyCount: history.length,
      sourceUrl: fighter.sourceUrl,
      providerId: fighter.providerId,
      lastSyncedAt: fighter.lastSyncedAt.toISOString(),
    },
  })
}
