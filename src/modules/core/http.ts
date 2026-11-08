import { db } from '@/lib/db'

/**
 * NOYAU VOLTRIX — Client HTTP pour fournisseurs de données sportives.
 *
 * Garanties :
 *  - Limitation de débit : file séquentielle, intervalle minimum entre requêtes.
 *  - Cache en base (table ApiCache) avec TTL par type de ressource.
 *  - Jamais de données fabriquées : une ressource introuvable (404) => null.
 *  - Une requête échouée => erreur typée, jamais de valeur par défaut inventée.
 */

export class ProviderHttpError extends Error {
  constructor(
    public provider: string,
    public url: string,
    public status: number | null,
    message: string
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

export interface FetchOptions {
  /** Clé de cache explicite ; par défaut l'URL. */
  cacheKey?: string
  /** TTL en millisecondes ; 0 = pas de cache. */
  ttlMs?: number
  /** Ignorer le cache en lecture. */
  forceRefresh?: boolean
  /** Délai réseau en ms. */
  timeoutMs?: number
}

interface QueueState {
  lastCallAt: number
  queue: Promise<void>
}

const queues = new Map<string, QueueState>()

function getQueue(provider: string): QueueState {
  let q = queues.get(provider)
  if (!q) {
    q = { lastCallAt: 0, queue: Promise.resolve() }
    queues.set(provider, q)
  }
  return q
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function readCache(key: string): Promise<unknown | null> {
  try {
    const row = await db.apiCache.findUnique({ where: { key } })
    if (row && row.expiresAt.getTime() > Date.now()) {
      return JSON.parse(row.payload) as unknown
    }
  } catch {
    // cache indisponible => on continue sans cache
  }
  return null
}

async function writeCache(key: string, payload: unknown, ttlMs: number): Promise<void> {
  if (ttlMs <= 0) return
  const expiresAt = new Date(Date.now() + ttlMs)
  const serialized = JSON.stringify(payload)
  try {
    await db.apiCache.upsert({
      where: { key },
      create: { key, payload: serialized, fetchedAt: new Date(), expiresAt },
      update: { payload: serialized, fetchedAt: new Date(), expiresAt },
    })
  } catch {
    // échec d'écriture cache non bloquant
  }
}

/**
 * Requête HTTP GET JSON avec cache, file séquentielle et limitation de débit.
 * Retourne null sur 404 (donnée absente chez le fournisseur).
 * Lance ProviderHttpError sur les autres échecs.
 */
export async function providerFetchJson<T>(
  provider: string,
  url: string,
  opts: FetchOptions = {}
): Promise<T | null> {
  const {
    cacheKey = `${provider}:${url}`,
    ttlMs = 0,
    forceRefresh = false,
    timeoutMs = 15000,
  } = opts

  if (!forceRefresh && ttlMs > 0) {
    const cached = await readCache(cacheKey)
    if (cached !== null) return cached as T
  }

  // File séquentielle par fournisseur : garantit l'intervalle minimum
  const minIntervalMs = RATE_LIMITS[provider] ?? 1000
  const q = getQueue(provider)
  const task = q.queue.then(async () => {
    const wait = q.lastCallAt + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    q.lastCallAt = Date.now()
  })
  q.queue = task.catch(() => undefined)
  await task

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Les 403/429 intermittents du CDN (throttling) méritent UNE relance polie
    // après une pause : observé le 2026-11-08 sur les endpoints ESPN.
    let res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VOLTRIX/2.0 (usage personnel non commercial)',
      },
      cache: 'no-store',
    })
    if (res.status === 403 || res.status === 429) {
      await sleep(2500)
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VOLTRIX/2.0 (usage personnel non commercial)',
        },
        cache: 'no-store',
      })
    }
    if (res.status === 404) return null
    if (!res.ok) {
      throw new ProviderHttpError(provider, url, res.status, `HTTP ${res.status}`)
    }
    const json = (await res.json()) as T
    if (ttlMs > 0 && Number.isFinite(ttlMs)) await writeCache(cacheKey, json, ttlMs)
    return json
  } catch (err) {
    if (err instanceof ProviderHttpError) throw err
    throw new ProviderHttpError(
      provider,
      url,
      null,
      err instanceof Error ? err.message : 'Erreur réseau inconnue'
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Limites de débit par fournisseur (ms entre deux requêtes). */
export const RATE_LIMITS: Record<string, number> = {
  espn: 900,
  'espn-core': 900,
}

/** TTL de cache recommandés par type de ressource. */
export const CACHE_TTL = {
  /** Scoreboard : même fraîcheur que le site ESPN, 10 min côté app. */
  scoreboard: 10 * 60 * 1000,
  /** Détail d'un combat : change jusqu'au coup d'envoi, stable ensuite. */
  competition: 60 * 60 * 1000,
  /** Fiche combattant : bio quasi immuable. */
  athlete: 24 * 60 * 60 * 1000,
  /** Stats de carrière : mises à jour après chaque combat. */
  athleteStats: 12 * 60 * 60 * 1000,
  /** Historique de combats. */
  athleteHistory: 24 * 60 * 60 * 1000,
} as const
