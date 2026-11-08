/**
 * MODULE MMA — Route : GET /api/mma/events
 * Liste les événements MMA synchronisés. Déclenche une synchronisation
 * automatique si les données sont périmées (> 30 min) et démarre
 * l'ordonnanceur de fond.
 *
 * Paramètres :
 *  - org   : filtre organisation (UFC | PFL | BELLATOR), optionnel
 *  - window: upcoming (défaut, à venir) | past (derniers 30 jours) | all
 *
 * Réponse : { events: [...], lastSyncAt, syncStatus }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureFreshEvents, lastEventsSyncAt, enrichEvent } from '@/modules/mma/services/sync'
import { startScheduler } from '@/modules/mma/services/scheduler'
import { ORGANIZATIONS, type Organization } from '@/modules/mma/types'

export async function GET(request: Request) {
  startScheduler()
  const url = new URL(request.url)
  const orgParam = (url.searchParams.get('org') ?? '').toUpperCase()
  const window = url.searchParams.get('window') ?? 'upcoming'

  let syncStatus: string | null = null
  try {
    await ensureFreshEvents()
  } catch {
    // la lecture reste possible même si la synchronisation échoue
    syncStatus = 'synchro échouée (données locales)'
  }

  // Enrichissement en arrière-plan des 3 prochains événements non détaillés
  // (catégories, rounds, segments, matchNumber) — sans bloquer la réponse.
  void db.mmaEvent
    .findMany({
      where: {
        detailsSynced: false,
        date: { gte: new Date() },
        status: { in: ['PROGRAMME', 'CONFIRME'] },
      },
      orderBy: { date: 'asc' },
      take: 3,
    })
    .then((pending) => Promise.all(pending.map((e) => enrichEvent(e.id).catch(() => undefined))))
    .catch(() => undefined)

  const now = new Date()
  const where = {
    ...(ORGANIZATIONS.includes(orgParam as Organization) ? { organization: orgParam } : {}),
    ...(window === 'upcoming'
      ? { date: { gte: new Date(now.getTime() - 6 * 3600000) } }
      : window === 'past'
        ? { date: { lt: now } }
        : {}),
  }

  const events = await db.mmaEvent.findMany({
    where,
    include: { fights: { include: { fighters: { include: { fighter: true } } } } },
    orderBy: window === 'past' ? { date: 'desc' } : { date: 'asc' },
    take: 40,
  })
  const last = await lastEventsSyncAt()
  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      shortName: e.shortName,
      organization: e.organization,
      date: e.date.toISOString(),
      status: e.status,
      venue: e.venueName,
      city: e.city,
      country: e.country,
      fightsCount: e.fights.length,
      mainEvent: mainEventLabel(e.fights),
      detailsSynced: e.detailsSynced,
      lastSyncedAt: e.lastSyncedAt.toISOString(),
    })),
    lastSyncAt: last ? last.toISOString() : null,
    syncStatus,
  })
}

/**
 * Tête d'affiche : combat avec le plus petit matchNumber (1 = main event,
 * vérifié sur ESPN le 2026-11-08). Repli : premier combat à 2 combattants.
 */
function mainEventLabel(
  fights: { matchNumber: number | null; fighters: { fighter: { fullName: string } }[] }[]
): string | null {
  const withTwo = fights.filter((f) => f.fighters.length === 2)
  if (withTwo.length === 0) return null
  const sorted = [...withTwo].sort((a, b) => (a.matchNumber ?? 99) - (b.matchNumber ?? 99))
  const names = sorted[0].fighters.map((ff) => ff.fighter.fullName)
  return names.length === 2 ? `${names[0]} vs. ${names[1]}` : null
}
