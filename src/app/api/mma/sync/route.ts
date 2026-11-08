/**
 * MODULE MMA — Route : /api/mma/sync
 *  GET  : état de la synchronisation (derniers journaux, ordonnanceur,
 *         compteurs de la base).
 *  POST : synchronisation manuelle complète (scoreboards + détails des
 *         prochains événements + fiches combattants des prochaines cartes).
 *
 * Body POST (optionnel) : { maxEvents?: number, maxFighters?: number }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fullSync, lastEventsSyncAt } from '@/modules/mma/services/sync'
import { schedulerInfo, startScheduler } from '@/modules/mma/services/scheduler'

export async function GET() {
  startScheduler()
  const logs = await db.syncLog.findMany({
    where: { module: 'mma' },
    orderBy: { startedAt: 'desc' },
    take: 15,
  })
  const [events, fights, fighters, fighterStats, history] = await Promise.all([
    db.mmaEvent.count(),
    db.mmaFight.count(),
    db.mmaFighter.count(),
    db.mmaFighterStats.count(),
    db.mmaFightHistory.count(),
  ])
  const last = await lastEventsSyncAt()
  return NextResponse.json({
    lastEventsSyncAt: last ? last.toISOString() : null,
    scheduler: schedulerInfo(),
    counts: { events, fights, fighters, fighterStats, history },
    logs: logs.map((l) => ({
      id: l.id,
      job: l.job,
      status: l.status,
      itemsFetched: l.itemsFetched,
      itemsCreated: l.itemsCreated,
      itemsUpdated: l.itemsUpdated,
      errors: l.errors ? (JSON.parse(l.errors) as unknown[]) : [],
      startedAt: l.startedAt.toISOString(),
      finishedAt: l.finishedAt?.toISOString() ?? null,
      durationMs: l.durationMs,
    })),
  })
}

export async function POST(request: Request) {
  startScheduler()
  let body: { maxEvents?: number; maxFighters?: number } = {}
  try {
    body = (await request.json()) as { maxEvents?: number; maxFighters?: number }
  } catch {
    body = {}
  }
  const result = await fullSync({
    maxEvents: Math.min(Math.max(body.maxEvents ?? 3, 1), 10),
    maxFighters: Math.min(Math.max(body.maxFighters ?? 60, 0), 200),
  })
  return NextResponse.json({
    ok: true,
    events: result.events,
    eventDetails: result.eventDetails,
    fightersEnriched: result.fighters.filter((f) => f.ok).length,
    fighterErrors: result.fighters.filter((f) => !f.ok).length,
  })
}
