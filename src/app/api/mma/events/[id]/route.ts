/**
 * MODULE MMA — Route : GET /api/mma/events/[id]
 * Détail d'un événement : carte complète des combats, groupée par segment.
 * Déclenche l'enrichissement des détails (catégorie, rounds) à la demande
 * si l'événement n'a pas encore été enrichi.
 *
 * Réponse : { event: { ..., fights: [...] } }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { enrichEvent } from '@/modules/mma/services/sync'
import { weightClassFr } from '@/modules/mma/types'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let event = await db.mmaEvent.findUnique({
    where: { id },
    include: { fights: { include: { fighters: { include: { fighter: true } } } } },
  })
  if (!event) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })
  }

  if (!event.detailsSynced) {
    await enrichEvent(event.id).catch(() => undefined)
    event = (await db.mmaEvent.findUnique({
      where: { id },
      include: { fights: { include: { fighters: { include: { fighter: true } } } } },
    })) as typeof event
    if (!event) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })
  }

  const fights = [...event.fights]
    .sort((a, b) => {
      const seg = (s?: string | null) => (s === 'Main Card' ? 0 : s === 'Prelims' ? 1 : s === 'Early Prelims' ? 2 : 3)
      const d = seg(a.cardSegment) - seg(b.cardSegment)
      if (d !== 0) return d
      return (a.matchNumber ?? 99) - (b.matchNumber ?? 99)
    })
    .map((f) => ({
      id: f.id,
      weightClass: f.weightClass,
      weightClassFr: weightClassFr(f.weightClass ?? undefined) ?? null,
      scheduledRounds: f.scheduledRounds,
      cardSegment: f.cardSegment,
      matchNumber: f.matchNumber,
      status: f.status,
      resultMethod: f.resultMethod,
      resultDetail: f.resultDetail,
      durationSeconds: f.durationSeconds,
      winnerExternalId: f.winnerExternalId,
      fighters: f.fighters
        .sort((x, y) => (x.corner ?? 9) - (y.corner ?? 9))
        .map((ff) => ({
          id: ff.fighter.id,
          externalId: ff.fighter.externalId,
          fullName: ff.fighter.fullName,
          nickname: ff.fighter.nickname,
          imageUrl: ff.fighter.imageUrl,
          flagUrl: ff.fighter.flagUrl,
          recordAtFight: ff.recordAtFight,
          wins: ff.fighter.wins,
          losses: ff.fighter.losses,
          draws: ff.fighter.draws,
          lastResults: ff.fighter.lastResults,
          isWinner: ff.isWinner,
          profileSynced: ff.fighter.profileSynced,
        })),
    }))

  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
      organization: event.organization,
      date: event.date.toISOString(),
      status: event.status,
      venue: event.venueName,
      city: event.city,
      country: event.country,
      lastSyncedAt: event.lastSyncedAt.toISOString(),
      fights,
    },
  })
}
