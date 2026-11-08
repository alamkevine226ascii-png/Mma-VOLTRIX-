/**
 * MODULE MMA — Ordonnanceur de synchronisation automatique.
 *
 * Dans le processus serveur VOLTRIX (Next.js), un ordonnanceur singleton :
 *  - toutes les 30 minutes  : synchronisation des événements (scoreboards) ;
 *  - toutes les 6 heures    : enrichissement des prochains événements
 *                             (catégories/rounds) et des fiches combattants
 *                             des prochaines cartes (volume borné) ;
 *  - au démarrage           : première synchronisation si les données sont
 *                             périmées.
 *
 * En production, la même logique peut être pilotée par un cron externe
 * (POST /api/mma/sync) — l'ordonnanceur interne reste la sécurité de repli.
 */
import { db } from '@/lib/db'
import { enrichEvent, enrichFighter, syncEvents, lastEventsSyncAt, EVENTS_SYNC_TTL_MS } from '@/modules/mma/services/sync'

const EVENTS_INTERVAL_MS = 30 * 60 * 1000
const ENRICH_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_EVENTS_TO_ENRICH = 3
const MAX_FIGHTERS_PER_RUN = 40

interface SchedulerState {
  timerEvents: ReturnType<typeof setInterval> | null
  timerEnrich: ReturnType<typeof setInterval> | null
  startedAt: Date
  runs: { job: string; at: string; status: string; durationMs: number }[]
}

const globalForScheduler = globalThis as unknown as {
  voltrixMmaScheduler: SchedulerState | undefined
}

function state(): SchedulerState {
  if (!globalForScheduler.voltrixMmaScheduler) {
    globalForScheduler.voltrixMmaScheduler = {
      timerEvents: null,
      timerEnrich: null,
      startedAt: new Date(),
      runs: [],
    }
  }
  return globalForScheduler.voltrixMmaScheduler
}

function record(job: string, status: string, durationMs: number): void {
  const s = state()
  s.runs.unshift({ job, at: new Date().toISOString(), status, durationMs })
  if (s.runs.length > 50) s.runs.length = 50
}

async function runEventsSync(): Promise<void> {
  const t0 = Date.now()
  try {
    const res = await syncEvents()
    record('events', res.status, res.durationMs)
  } catch (err) {
    record('events', `ERREUR: ${err instanceof Error ? err.message : String(err)}`, Date.now() - t0)
  }
}

async function runEnrichment(): Promise<void> {
  const t0 = Date.now()
  try {
    const upcoming = await db.mmaEvent.findMany({
      where: { date: { gte: new Date() }, status: { in: ['PROGRAMME', 'CONFIRME'] } },
      orderBy: { date: 'asc' },
      take: MAX_EVENTS_TO_ENRICH,
    })
    for (const ev of upcoming) {
      if (!ev.detailsSynced) await enrichEvent(ev.id)
    }
    const fighters = await db.mmaFighter.findMany({
      where: {
        profileSynced: false,
        fights: {
          some: {
            fight: {
              status: { in: ['PROGRAMME', 'CONFIRME'] },
              event: { id: { in: upcoming.map((e) => e.id) } },
            },
          },
        },
      },
      take: MAX_FIGHTERS_PER_RUN,
    })
    for (const f of fighters) {
      await enrichFighter(f.id)
    }
    record('enrich', `OK (${fighters.length} fiches)`, Date.now() - t0)
  } catch (err) {
    record('enrich', `ERREUR: ${err instanceof Error ? err.message : String(err)}`, Date.now() - t0)
  }
}

/** Démarre l'ordonnanceur (idempotent). */
export function startScheduler(): SchedulerState {
  const s = state()
  if (s.timerEvents) return s

  // Première exécution : uniquement si les données sont périmées
  void lastEventsSyncAt().then((last) => {
    if (!last || Date.now() - last.getTime() > EVENTS_SYNC_TTL_MS) {
      void runEventsSync().then(() => runEnrichment())
    }
  })

  s.timerEvents = setInterval(() => void runEventsSync(), EVENTS_INTERVAL_MS)
  s.timerEnrich = setInterval(() => void runEnrichment(), ENRICH_INTERVAL_MS)
  return s
}

export function schedulerInfo(): {
  startedAt: string
  eventsIntervalMs: number
  enrichIntervalMs: number
  runs: { job: string; at: string; status: string; durationMs: number }[]
} {
  const s = state()
  return {
    startedAt: s.startedAt.toISOString(),
    eventsIntervalMs: EVENTS_INTERVAL_MS,
    enrichIntervalMs: ENRICH_INTERVAL_MS,
    runs: s.runs,
  }
}
