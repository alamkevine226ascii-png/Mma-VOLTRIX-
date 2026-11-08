/**
 * MODULE MMA — Service de synchronisation.
 *
 * Pipeline :
 *  1. syncEvents()      : scoreboards ESPN (UFC, PFL, Bellator) sur fenêtre
 *                         [-30 j ; +120 j] -> événements, combats, gabarits de
 *                         combattants (dédoublonnés par externalId + nom normalisé).
 *  2. enrichEvent()     : détails par combat (catégorie, rounds, segment,
 *                         résultat) — déclenché à la demande ou en arrière-plan
 *                         pour les prochains événements.
 *  3. enrichFighter()   : fiche complète + stats + palmarès + historique.
 *  4. enrichRecentResults() : méthode/durée des combats terminés récents.
 *
 * Statuts : PROGRAMME/CONFIRME/REPORTE/ANNULE/TERMINE/EN_COURS.
 *  - CONFIRME = règle VOLTRIX : combat PROGRAMME dont les deux fiches
 *    combattants sont synchronisées et la catégorie de poids connue.
 *  - Un combat qui disparaît d'une carte déjà connue est marqué ANNULE
 *    (réversible s'il réapparaît).
 */
import { db } from '@/lib/db'
import { SyncTracker } from '@/modules/core/sync-log'
import { ProviderHttpError } from '@/modules/core/http'
import {
  espnProvider,
  parseExternalIds,
  type ScoreboardEventDTO,
} from '@/modules/mma/providers/espn'
import {
  inchesToCm,
  lastResultsFromHistory,
  normalizeName,
  ORGANIZATIONS,
  type Organization,
} from '@/modules/mma/types'

const SYNC_WINDOW_PAST_DAYS = 30
const SYNC_WINDOW_FUTURE_DAYS = 120
export const EVENTS_SYNC_TTL_MS = 30 * 60 * 1000

/** Dernière synchronisation d'événements réussie. */
export async function lastEventsSyncAt(): Promise<Date | null> {
  const row = await db.syncLog.findFirst({
    where: { module: 'mma', job: 'events', status: { in: ['SUCCESS', 'PARTIAL'] } },
    orderBy: { startedAt: 'desc' },
  })
  return row?.finishedAt ?? null
}

/** Lance une synchronisation d'événements si les données sont périmées. */
export async function ensureFreshEvents(maxAgeMs = EVENTS_SYNC_TTL_MS): Promise<void> {
  const last = await lastEventsSyncAt()
  if (!last || Date.now() - last.getTime() > maxAgeMs) {
    await syncEvents()
  }
}

export interface SyncEventsResult {
  status: string
  itemsFetched: number
  itemsCreated: number
  itemsUpdated: number
  durationMs: number
  errors: { step: string; message: string }[]
}

/**
 * Noms génériques utilisés par ESPN pour les combattants non annoncés.
 * Ces « combattants » ne sont pas de vraies personnes : ils ne sont jamais
 * créés dans la base (le combat reste visible avec un marqueur « à annoncer »).
 */
const PLACEHOLDER_NAMES = new Set([
  'tba',
  'tbd',
  'opponent tba',
  'opponent tbd',
  'to be announced',
  'to be determined',
])

/** Exporté pour les tests : détection des noms génériques (TBA...) chez ESPN. */
export function isPlaceholderFighter(fullName: string): boolean {
  return PLACEHOLDER_NAMES.has(normalizeName(fullName))
}

/** Verrou global : empêche deux synchronisations simultanées (ordonnanceur
 *  + bouton manuel) de se marcher dessus (doublons de création). */
let eventsSyncLock: Promise<SyncEventsResult> | null = null

/** Étape 1 — scoreboards -> événements, combats, combattants (gabarits). */
export async function syncEvents(): Promise<SyncEventsResult> {
  if (eventsSyncLock) return eventsSyncLock
  eventsSyncLock = doSyncEvents().finally(() => {
    eventsSyncLock = null
  })
  return eventsSyncLock
}

async function doSyncEvents(): Promise<SyncEventsResult> {
  const tracker = new SyncTracker('mma', 'events')
  await tracker.start()
  const from = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000)
  const to = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86400000)

  for (const org of ORGANIZATIONS) {
    try {
      const events = await espnProvider.getScoreboard(org, from, to)
      tracker.addFetched(events.length)
      for (const dto of events) {
        try {
          await upsertEventWithFights(dto, tracker)
        } catch (err) {
          tracker.addError(`event:${dto.externalId}`, errorMessage(err))
        }
      }
    } catch (err) {
      tracker.addError(`scoreboard:${org}`, errorMessage(err))
    }
  }

  // Détection des combats disparus de cartes connues (annoncés puis retirés)
  try {
    await markDisappearedFights(tracker)
  } catch (err) {
    tracker.addError('disappeared-fights', errorMessage(err))
  }

  return tracker.finish()
}

async function upsertEventWithFights(dto: ScoreboardEventDTO, tracker: SyncTracker): Promise<void> {
  const event = await db.mmaEvent.upsert({
    where: { externalId: dto.externalId },
    create: {
      externalId: dto.externalId,
      providerId: 'espn',
      organization: dto.organization,
      name: dto.name,
      shortName: dto.shortName,
      date: dto.date,
      status: dto.status,
      rawStatus: dto.rawStatus,
      venueName: dto.venueName,
      city: dto.city,
      country: dto.country,
      lastSyncedAt: new Date(),
    },
    update: {
      name: dto.name,
      shortName: dto.shortName,
      date: dto.date,
      status: dto.status,
      rawStatus: dto.rawStatus,
      venueName: dto.venueName,
      city: dto.city,
      country: dto.country,
      lastSyncedAt: new Date(),
    },
  })
  tracker.addUpdated(1)

  // Gabarits de combattants (dédoublonnage par externalId ; le nom normalisé
  // sert de garde-fou inter-sources). Les placeholders « TBA » ne sont pas
  // de vrais combattants : jamais créés.
  for (const f of dto.fights) {
    for (const fighterDto of f.fighters) {
      if (isPlaceholderFighter(fighterDto.fullName)) continue
      const existing = await db.mmaFighter.findUnique({ where: { externalId: fighterDto.externalId } })
      if (!existing) {
        const nameCollisions = await db.mmaFighter.findFirst({
          where: { normalizedName: normalizeName(fighterDto.fullName) },
        })
        // Si un homonyme normalisé existe déjà sous une autre clé externe,
        // on conserve les deux entrées (fournisseurs distincts) mais on le trace.
        if (!nameCollisions) {
          await db.mmaFighter.create({
            data: {
              externalId: fighterDto.externalId,
              providerId: 'espn',
              fullName: fighterDto.fullName,
              normalizedName: normalizeName(fighterDto.fullName),
              lastSyncedAt: new Date(),
            },
          })
          tracker.addCreated(1)
        }
      } else {
        await db.mmaFighter.update({
          where: { id: existing.id },
          data: { fullName: fighterDto.fullName, lastSyncedAt: new Date() },
        })
      }
    }
  }

  for (const fightDto of dto.fights) {
    const winner = fightDto.fighters.find((x) => x.isWinner === true)
    const fight = await db.mmaFight.upsert({
      where: { externalId: fightDto.externalId },
      create: {
        externalId: fightDto.externalId,
        eventId: event.id,
        status: fightDto.status,
        rawStatus: fightDto.rawStatus,
        winnerExternalId: winner?.externalId ?? null,
        completedAt: fightDto.status === 'TERMINE' ? fightDto.date : null,
        lastSyncedAt: new Date(),
      },
      update: {
        status: fightDto.status,
        rawStatus: fightDto.rawStatus,
        winnerExternalId: winner?.externalId ?? undefined,
        completedAt: fightDto.status === 'TERMINE' ? fightDto.date : undefined,
        lastSyncedAt: new Date(),
      },
    })
    tracker.addUpdated(1)

    // Liaison combat <-> combattant (placeholders exclus)
    for (const fighterDto of fightDto.fighters) {
      if (isPlaceholderFighter(fighterDto.fullName)) continue
      const fighter = await db.mmaFighter.findUnique({ where: { externalId: fighterDto.externalId } })
      if (!fighter) continue
      await db.mmaFightFighter.upsert({
        where: { fightId_fighterId: { fightId: fight.id, fighterId: fighter.id } },
        create: {
          fightId: fight.id,
          fighterId: fighter.id,
          corner: fighterDto.corner,
          isWinner: fighterDto.isWinner,
          recordAtFight: fighterDto.recordAtFight,
          syncedAt: new Date(),
        },
        update: {
          corner: fighterDto.corner,
          isWinner: fighterDto.isWinner,
          recordAtFight: fighterDto.recordAtFight,
          syncedAt: new Date(),
        },
      })
    }

    // Mise à jour opportuniste du palmarès depuis le record affiché au combat
    if (fightDto.status === 'TERMINE' && fightDto.fighters.length === 2) {
      for (const fd of fightDto.fighters) {
        const fighter = await db.mmaFighter.findUnique({ where: { externalId: fd.externalId } })
        if (fighter && fd.recordAtFight) {
          const m = fd.recordAtFight.match(/^(\d+)-(\d+)-(\d+)$/)
          if (m) {
            await db.mmaFighter.update({
              where: { id: fighter.id },
              data: { wins: Number(m[1]), losses: Number(m[2]), draws: Number(m[3]) },
            })
          }
        }
      }
    }
  }
}

/**
 * Un combat connu comme annoncé (PROGRAMME/CONFIRME) qui n'apparaît plus
 * dans la carte synchronisée de son événement est marqué ANNULE.
 * S'il réapparaît, il repasse à PROGRAMME (réversible).
 */
async function markDisappearedFights(tracker: SyncTracker): Promise<void> {
  const cutoff = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000)
  const events = await db.mmaEvent.findMany({
    where: { date: { gte: cutoff }, status: { in: ['PROGRAMME', 'CONFIRME', 'REPORTE', 'EN_COURS'] } },
    include: { fights: true },
  })
  for (const event of events) {
    if (event.fights.length === 0) continue
    // La carte a-t-elle été resynchronisée avec une liste plus courte ?
    const freshFights = event.fights.filter(
      (f) => Date.now() - f.lastSyncedAt.getTime() < EVENTS_SYNC_TTL_MS * 2
    )
    const stale = event.fights.filter(
      (f) =>
        ['PROGRAMME', 'CONFIRME'].includes(f.status) &&
        Date.now() - f.lastSyncedAt.getTime() > EVENTS_SYNC_TTL_MS * 2
    )
    if (freshFights.length > 0 && stale.length > 0) {
      for (const f of stale) {
        await db.mmaFight.update({ where: { id: f.id }, data: { status: 'ANNULE' } })
        tracker.addUpdated(1)
      }
    }
  }
}

/**
 * Étape 2 — détails d'un événement : catégorie, rounds, segment, résultat des combats.
 * opts.fightIds : limiter l'enrichissement à certains combats internes (à la demande).
 */
export async function enrichEvent(
  eventId: string,
  opts: { force?: boolean; fightIds?: string[] } = {}
): Promise<{ updated: number; errors: string[] }> {
  const tracker = new SyncTracker('mma', 'event-details')
  await tracker.start()
  const event = await db.mmaEvent.findUnique({ where: { id: eventId }, include: { fights: true } })
  if (!event) {
    tracker.addError('load', 'Événement introuvable')
    await tracker.finish()
    return { updated: 0, errors: ['Événement introuvable'] }
  }
  if (event.detailsSynced && !opts.force) {
    await tracker.finish()
    return { updated: 0, errors: [] }
  }
  const parsed = parseExternalIds(event.externalId)
  if (!parsed || parsed.kind !== 'event' || !parsed.org) {
    tracker.addError('parse', `externalId illisible: ${event.externalId}`)
    await tracker.finish()
    return { updated: 0, errors: ['externalId illisible'] }
  }

  for (const fight of event.fights) {
    if (opts.fightIds && !opts.fightIds.includes(fight.id)) continue
    const cp = parseExternalIds(fight.externalId)
    if (!cp || cp.kind !== 'competition') continue
    try {
      const detail = await espnProvider.getFightDetail(parsed.org, parsed.espnId, cp.espnId)
      if (detail) {
        tracker.addFetched(1)
        // On ne remplace jamais une valeur connue par null (défense contre les
        // réponses incomplètes du fournisseur) : undefined = champ inchangé.
        await db.mmaFight.update({
          where: { id: fight.id },
          data: {
            weightClass: detail.weightClass ?? undefined,
            scheduledRounds: detail.scheduledRounds ?? undefined,
            cardSegment: detail.cardSegment ?? undefined,
            matchNumber: detail.matchNumber ?? undefined,
            status: detail.status,
            rawStatus: detail.rawStatus,
            durationSeconds: detail.durationSeconds ?? undefined,
            resultMethod: detail.resultMethod ?? undefined,
            resultDetail: detail.resultDetail ?? undefined,
            winnerExternalId: fight.winnerExternalId ?? detail.winnerExternalId,
            lastSyncedAt: new Date(),
          },
        })
        tracker.addUpdated(1)
      }
    } catch (err) {
      tracker.addError(`fight:${fight.externalId}`, errorMessage(err))
    }
  }

  // Ne marquer l'événement "détails complets" que si l'on a bien traité
  // toute la carte (pas de filtre fightIds).
  if (!opts.fightIds) {
    await db.mmaEvent.update({ where: { id: event.id }, data: { detailsSynced: true } })
  }
  const res = await tracker.finish()
  return { updated: res.itemsUpdated, errors: res.errors.map((e) => e.message) }
}

/**
 * Étape 3 — fiche complète d'un combattant (bio, stats, palmarès, historique).
 * Retourne l'identifiant interne du combattant.
 */
export async function enrichFighter(fighterId: string): Promise<{ ok: boolean; errors: string[] }> {
  const fighter = await db.mmaFighter.findUnique({ where: { id: fighterId } })
  if (!fighter) return { ok: false, errors: ['Combattant introuvable'] }
  const parsed = parseExternalIds(fighter.externalId)
  if (!parsed || parsed.kind !== 'athlete') return { ok: false, errors: ['externalId illisible'] }

  const errors: string[] = []
  let enrichedAny = false

  // Fiche biographique
  try {
    const profile = await espnProvider.getFighterProfile(parsed.espnId)
    if (profile) {
      enrichedAny = true
      await db.mmaFighter.update({
        where: { id: fighter.id },
        data: {
          fullName: profile.fullName ?? fighter.fullName,
          nickname: profile.nickname,
          birthDate: profile.birthDate ? new Date(profile.birthDate) : null,
          nationality: profile.nationality,
          flagUrl: profile.flagUrl,
          imageUrl: profile.imageUrl,
          heightCm: inchesToCm(profile.heightInches),
          reachCm: inchesToCm(profile.reachInches),
          weightLbs: profile.weightLbs,
          weightClass: profile.weightClass,
          stance: profile.stance,
          fightingStyle: profile.fightingStyle,
          active: profile.active,
          sourceUrl: `https://www.espn.com/mma/fighter/_/id/${parsed.espnId}`,
          profileSynced: true,
          lastSyncedAt: new Date(),
        },
      })
    }
  } catch (err) {
    errors.push(errorMessage(err))
  }

  // Statistiques de carrière
  try {
    const stats = await espnProvider.getFighterStats(parsed.espnId)
    if (stats) {
      enrichedAny = true
      await db.mmaFighterStats.upsert({
        where: { fighterId: fighter.id },
        create: {
          fighterId: fighter.id,
          sigStrikesLandedPerMin: stats.sigStrikesLandedPerMin,
          strikingAccuracy: stats.strikingAccuracy,
          takedownsPer15Min: stats.takedownsPer15Min,
          takedownAccuracy: stats.takedownAccuracy,
          submissionsPer15Min: stats.submissionsPer15Min,
          koPercentage: stats.koPercentage,
          tkoPercentage: stats.tkoPercentage,
          decisionPercentage: stats.decisionPercentage,
          sourceUrl: `https://www.espn.com/mma/fighter/stats/_/id/${parsed.espnId}`,
          syncedAt: new Date(),
        },
        update: {
          sigStrikesLandedPerMin: stats.sigStrikesLandedPerMin,
          strikingAccuracy: stats.strikingAccuracy,
          takedownsPer15Min: stats.takedownsPer15Min,
          takedownAccuracy: stats.takedownAccuracy,
          submissionsPer15Min: stats.submissionsPer15Min,
          koPercentage: stats.koPercentage,
          tkoPercentage: stats.tkoPercentage,
          decisionPercentage: stats.decisionPercentage,
          syncedAt: new Date(),
        },
      })
    }
  } catch (err) {
    errors.push(errorMessage(err))
  }

  // Palmarès détaillé
  try {
    const record = await espnProvider.getFighterRecord(parsed.espnId)
    if (record) {
      enrichedAny = true
      await db.mmaFighter.update({
        where: { id: fighter.id },
        data: {
          wins: record.wins ?? undefined,
          losses: record.losses ?? undefined,
          draws: record.draws ?? undefined,
          noContests: record.noContests ?? undefined,
          winsByKo: record.winsByKo ?? undefined,
          winsBySub: record.winsBySub ?? undefined,
          titleWins: record.titleWins ?? undefined,
        },
      })
    }
  } catch (err) {
    errors.push(errorMessage(err))
  }

  // Historique des combats + forme récente
  try {
    const history = await espnProvider.getFighterHistory(parsed.espnId)
    if (history.length > 0) {
      enrichedAny = true
      for (const h of history) {
        await db.mmaFightHistory.upsert({
          where: { externalFightKey: h.externalFightKey },
          create: {
            fighterId: fighter.id,
            externalFightKey: h.externalFightKey,
            espnEventId: h.espnEventId,
            espnCompetitionId: h.espnCompetitionId,
            espnLeagueId: h.espnLeagueId,
            eventName: h.eventName,
            eventDate: h.eventDate,
            result: h.result,
            opponentName: h.opponentName,
            opponentExternalId: h.opponentExternalId,
            titleFight: h.titleFight,
            syncedAt: new Date(),
          },
          update: {
            espnEventId: h.espnEventId,
            espnCompetitionId: h.espnCompetitionId,
            espnLeagueId: h.espnLeagueId,
            eventName: h.eventName,
            eventDate: h.eventDate,
            result: h.result,
            opponentName: h.opponentName,
            opponentExternalId: h.opponentExternalId,
            titleFight: h.titleFight,
            syncedAt: new Date(),
          },
        })
      }
      const all = await db.mmaFightHistory.findMany({ where: { fighterId: fighter.id } })
      const last = lastResultsFromHistory(all.map((x) => ({ result: x.result, eventDate: x.eventDate })))
      await db.mmaFighter.update({ where: { id: fighter.id }, data: { lastResults: last } })
    }
  } catch (err) {
    errors.push(errorMessage(err))
  }

  if (enrichedAny) {
    await db.mmaFighter.update({ where: { id: fighter.id }, data: { lastSyncedAt: new Date() } })
    // Re-évaluation du statut CONFIRME des combats concernés
    await refreshConfirmedStatuses()
  }

  return { ok: enrichedAny || errors.length === 0, errors }
}

/**
 * Règle VOLTRIX documentée : un combat PROGRAMME passe à CONFIRME lorsque
 * ses deux combattants ont une fiche synchronisée ET que la catégorie de
 * poids est connue. Il ne s'agit pas d'un statut officiel du fournisseur
 * mais d'un indicateur d'exhaustivité des données.
 */
export async function refreshConfirmedStatuses(): Promise<number> {
  const fights = await db.mmaFight.findMany({
    where: { status: { in: ['PROGRAMME', 'CONFIRME'] } },
    include: { fighters: { include: { fighter: true } } },
  })
  let changed = 0
  for (const fight of fights) {
    const fighters = fight.fighters.map((ff) => ff.fighter)
    const complete =
      fighters.length === 2 &&
      fighters.every((f) => f.profileSynced) &&
      fight.weightClass !== null
    const target = complete ? 'CONFIRME' : 'PROGRAMME'
    if (fight.status !== target) {
      await db.mmaFight.update({ where: { id: fight.id }, data: { status: target } })
      changed++
    }
  }
  return changed
}

/**
 * Synchronisation complète (bouton manuel) : événements + détails des
 * prochains événements + fiches des combattants des prochaines cartes.
 */
export async function fullSync(options: { maxEvents?: number; maxFighters?: number } = {}): Promise<{
  events: SyncEventsResult
  eventDetails: { updated: number; errors: string[] }[]
  fighters: { ok: boolean; errors: string[] }[]
}> {
  const events = await syncEvents()
  const upcoming = await db.mmaEvent.findMany({
    where: { date: { gte: new Date() }, status: { in: ['PROGRAMME', 'CONFIRME'] } },
    orderBy: { date: 'asc' },
    take: options.maxEvents ?? 3,
  })
  const eventDetails: { updated: number; errors: string[] }[] = []
  for (const ev of upcoming) {
    eventDetails.push(await enrichEvent(ev.id))
  }

  const fighters = await db.mmaFighter.findMany({
    where: {
      fights: {
        some: { fight: { status: { in: ['PROGRAMME', 'CONFIRME'] }, event: { id: { in: upcoming.map((e) => e.id) } } } },
      },
    },
    take: options.maxFighters ?? 60,
  })
  const fighterResults: { ok: boolean; errors: string[] }[] = []
  for (const f of fighters) {
    if (!f.profileSynced) {
      fighterResults.push(await enrichFighter(f.id))
    }
  }
  return { events, eventDetails, fighters: fighterResults }
}

function errorMessage(err: unknown): string {
  if (err instanceof ProviderHttpError) return `${err.provider} ${err.status ?? 'réseau'}: ${err.message}`
  if (err instanceof Error) return err.message
  return String(err)
}
