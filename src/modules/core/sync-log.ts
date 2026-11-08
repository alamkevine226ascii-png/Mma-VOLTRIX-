import { db } from '@/lib/db'

/**
 * NOYAU VOLTRIX — Journal de synchronisation.
 * Chaque tâche de synchronisation est tracée : module, job, statut,
 * volumes (récupérés/créés/mis à jour), erreurs, durée.
 */

export interface SyncError {
  step: string
  message: string
}

export class SyncTracker {
  private errors: SyncError[] = []
  private fetched = 0
  private created = 0
  private updated = 0
  private readonly startedAt = new Date()
  private logId: string | null = null

  constructor(
    private readonly module: string,
    private readonly job: string
  ) {}

  async start(): Promise<void> {
    try {
      const row = await db.syncLog.create({
        data: {
          module: this.module,
          job: this.job,
          status: 'RUNNING',
          startedAt: this.startedAt,
        },
      })
      this.logId = row.id
    } catch {
      // journalisation best-effort
    }
  }

  addFetched(n = 1): void {
    this.fetched += n
  }
  addCreated(n = 1): void {
    this.created += n
  }
  addUpdated(n = 1): void {
    this.updated += n
  }
  addError(step: string, message: string): void {
    this.errors.push({ step, message: message.slice(0, 500) })
  }

  get errorCount(): number {
    return this.errors.length
  }

  async finish(): Promise<{ status: string; itemsFetched: number; itemsCreated: number; itemsUpdated: number; durationMs: number; errors: SyncError[] }> {
    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - this.startedAt.getTime()
    const status = this.errors.length === 0 ? 'SUCCESS' : this.fetched > 0 ? 'PARTIAL' : 'FAILED'
    if (this.logId) {
      try {
        await db.syncLog.update({
          where: { id: this.logId },
          data: {
            status,
            itemsFetched: this.fetched,
            itemsCreated: this.created,
            itemsUpdated: this.updated,
            errors: this.errors.length ? JSON.stringify(this.errors) : null,
            finishedAt,
            durationMs,
          },
        })
      } catch {
        // journalisation best-effort
      }
    }
    return {
      status,
      itemsFetched: this.fetched,
      itemsCreated: this.created,
      itemsUpdated: this.updated,
      durationMs,
      errors: this.errors,
    }
  }
}
