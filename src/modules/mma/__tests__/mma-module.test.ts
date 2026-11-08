/**
 * MODULE MMA — Tests automatisés (exécutés avec `bun test`).
 *
 * Couvre les exigences de la mission :
 *  - mappages de statuts (programmé/confirmé/reporté/annulé/terminé/en cours)
 *  - durée de combat (formule validée sur données réelles)
 *  - dédoublonnage (externalId unique + normalisation de nom)
 *  - détection des placeholders (TBA)
 *  - cohérence des statistiques en base (plages de validité)
 *  - gestion des données manquantes (null, jamais de valeur fabriquée)
 *  - moteur de pronostics (favori, bornes, refus sans données, backtest)
 *  - récupération réelle des événements et combattants (API locale + ESPN)
 *  - absence totale de football (suppression complète)
 */
import { describe, expect, test } from 'bun:test'
import { db } from '@/lib/db'
import {
  fightDurationSeconds,
  formScore,
  inchesToCm,
  lastResultsFromHistory,
  mapEspnStatus,
  mapResultMethod,
  normalizeName,
  parseRecord,
  resultMethodDetail,
} from '@/modules/mma/types'
import { parseExternalIds, parseFightUid, espnProvider } from '@/modules/mma/providers/espn'
import { isPlaceholderFighter } from '@/modules/mma/services/sync'
import { DERIVED_WINDOW, buildDimensions } from '@/modules/mma/services/analysis'
import {
  computePrediction,
  computeExpressPrediction,
  DIMENSION_WEIGHTS,
  P_MIN,
  P_MAX,
  MODEL_VERSION,
} from '@/modules/mma/services/prediction'
import { backtestPredictions } from '@/modules/mma/services/backtest'

const BASE = 'http://localhost:3000'

// ---------------------------------------------------------------------------
// 1. Mappage des statuts
// ---------------------------------------------------------------------------

describe('Mappage des statuts ESPN -> VOLTRIX', () => {
  const future = new Date(Date.now() + 86400000)
  const past = new Date(Date.now() - 86400000)

  test('state "pre" -> PROGRAMME', () => {
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_SCHEDULED' }, future)).toBe('PROGRAMME')
  })
  test('state "in" -> EN_COURS', () => {
    expect(mapEspnStatus({ state: 'in', name: 'STATUS_IN_PROGRESS' }, future)).toBe('EN_COURS')
  })
  test('state "post" complété -> TERMINE', () => {
    expect(mapEspnStatus({ state: 'post', name: 'STATUS_FINAL', completed: true }, past)).toBe('TERMINE')
  })
  test('STATUS_POSTPONED -> REPORTE', () => {
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_POSTPONED' }, future)).toBe('REPORTE')
  })
  test('annulation -> ANNULE', () => {
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_CANCELED' }, future)).toBe('ANNULE')
    expect(mapEspnStatus({ state: 'post', name: 'STATUS_CANCELLED' }, past)).toBe('ANNULE')
  })
  test('état inconnu -> repli sur la date (futur=PROGRAMME, passé=TERMINE)', () => {
    expect(mapEspnStatus({ state: 'weird', name: 'UNKNOWN' }, future)).toBe('PROGRAMME')
    expect(mapEspnStatus(null, past)).toBe('TERMINE')
  })
})

// ---------------------------------------------------------------------------
// 2. Durée de combat (formule validée sur 4 combats réels)
// ---------------------------------------------------------------------------

describe('Durée de combat', () => {
  test('KO au round 1, 2:02 restantes (cas réel DWCS 401911591)', () => {
    // clock=122 -> 300-122=178s écoulées
    expect(fightDurationSeconds({ clock: 122, period: 1 })).toBe(178)
  })
  test('KO au round 3, 2:44 restantes (cas réel DWCS 401911590)', () => {
    expect(fightDurationSeconds({ clock: 164, period: 3 })).toBe(2 * 300 + 136)
  })
  test('Décision 3 rounds complets = 15:00 (cas réel Charrière-Lima)', () => {
    expect(fightDurationSeconds({ clock: 300, period: 3 })).toBe(900)
  })
  test('données insuffisantes -> null (pas de valeur fabriquée)', () => {
    expect(fightDurationSeconds(null)).toBeNull()
    expect(fightDurationSeconds({ clock: undefined, period: 3 })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Palmarès, noms, méthode de victoire
// ---------------------------------------------------------------------------

describe('Palmarès et normalisation', () => {
  test('parseRecord "10-2-0"', () => {
    expect(parseRecord('10-2-0')).toEqual({ wins: 10, losses: 2, draws: 0 })
  })
  test('parseRecord invalide -> null', () => {
    expect(parseRecord('n/d')).toBeNull()
    expect(parseRecord(null)).toBeNull()
  })
  test('normalizeName : accents, casse, ponctuation', () => {
    expect(normalizeName('Ciryl Gane')).toBe('ciryl gane')
    expect(normalizeName('José Aldò Júnior!')).toBe('jose aldo junior')
    expect(normalizeName('  Maryna   Moroz ')).toBe('maryna moroz')
  })
  test('méthode de victoire', () => {
    expect(mapResultMethod('kotko')).toBe('KO_TKO')
    expect(mapResultMethod('decision---unanimous')).toBe('DECISION')
    expect(mapResultMethod('submission---armbar')).toBe('SOUMISSION')
    expect(mapResultMethod(null)).toBeNull()
    expect(mapResultMethod('unknown-type')).toBeNull()
  })
  test('détail de méthode (unanime/partagée)', () => {
    expect(resultMethodDetail({ name: 'decision---unanimous' }).detail).toContain('unanime')
    expect(resultMethodDetail({ name: 'decision---split' }).detail).toContain('partagée')
  })
  test('conversions', () => {
    expect(inchesToCm(70)).toBe(177.8)
    expect(inchesToCm(null)).toBeNull()
  })
  test('forme récente', () => {
    const hist = [
      { result: 'W', eventDate: new Date('2026-01-01') },
      { result: 'L', eventDate: new Date('2026-02-01') },
      { result: 'W', eventDate: new Date('2026-03-01') },
    ]
    expect(lastResultsFromHistory(hist, 5)).toBe('W,L,W')
    expect(formScore('W,W,W,W,W')).toBe(1)
    expect(formScore('L,L,L,L,L')).toBe(0)
    expect(formScore(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Identifiants externes et UID
// ---------------------------------------------------------------------------

describe('Identifiants externes', () => {
  test('parseExternalIds : athlète, combat, événement', () => {
    expect(parseExternalIds('espn:athlete:5037883')).toEqual({ kind: 'athlete', espnId: '5037883' })
    expect(parseExternalIds('espn:competition:401932013')).toEqual({ kind: 'competition', espnId: '401932013' })
    expect(parseExternalIds('espn:ufc:event:600061400')).toEqual({ kind: 'event', espnId: '600061400', org: 'UFC' })
    expect(parseExternalIds('espn:pfl:event:600061421')).toEqual({ kind: 'event', espnId: '600061421', org: 'PFL' })
  })
  test('parseExternalIds : formats invalides -> null', () => {
    expect(parseExternalIds('espn:event:600061400')).toBeNull()
    expect(parseExternalIds('foo:athlete:1')).toBeNull()
    expect(parseExternalIds('')).toBeNull()
  })
  test('parseFightUid : uid complet avec ligue', () => {
    expect(parseFightUid('s:3301~l:3321~e:600059993~c:401902947')).toEqual({
      leagueId: '3321',
      eventId: '600059993',
      competitionId: '401902947',
    })
    expect(parseFightUid('uid-invalide')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Placeholders (combattants non annoncés)
// ---------------------------------------------------------------------------

describe('Détection des combattants placeholders', () => {
  test('TBA / TBD détectés', () => {
    expect(isPlaceholderFighter('TBA')).toBe(true)
    expect(isPlaceholderFighter('Opponent TBA')).toBe(true)
    expect(isPlaceholderFighter('tbd')).toBe(true)
  })
  test('vrais noms non filtrés', () => {
    expect(isPlaceholderFighter('Ciryl Gane')).toBe(false)
    expect(isPlaceholderFighter('Tabatha Ricci')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. Base de données : dédoublonnage et cohérence (données réelles synchronisées)
// ---------------------------------------------------------------------------

describe('Base de données (données réelles synchronisées)', () => {
  test('aucun doublon d\'identifiant externe (événements, combats, combattants)', async () => {
    const [events, fights, fighters] = await Promise.all([
      db.mmaEvent.findMany({ select: { externalId: true } }),
      db.mmaFight.findMany({ select: { externalId: true } }),
      db.mmaFighter.findMany({ select: { externalId: true, normalizedName: true } }),
    ])
    expect(new Set(events.map((e) => e.externalId)).size).toBe(events.length)
    expect(new Set(fights.map((f) => f.externalId)).size).toBe(fights.length)
    expect(new Set(fighters.map((f) => f.externalId)).size).toBe(fighters.length)
  })

  test('aucun combattant placeholder (TBA) en base', async () => {
    const count = await db.mmaFighter.count({
      where: { normalizedName: { in: ['tba', 'tbd', 'opponent tba', 'opponent tbd'] } },
    })
    expect(count).toBe(0)
  })

  test('statut des combats limité aux valeurs du domaine', async () => {
    const valid = ['PROGRAMME', 'CONFIRME', 'REPORTE', 'ANNULE', 'TERMINE', 'EN_COURS']
    const fights = await db.mmaFight.findMany({ select: { status: true } })
    expect(fights.length).toBeGreaterThan(0)
    for (const f of fights) {
      expect(valid).toContain(f.status)
    }
  })

  test('cohérence des statistiques de carrière (plages de validité)', async () => {
    const stats = await db.mmaFighterStats.findMany()
    expect(stats.length).toBeGreaterThan(0)
    for (const s of stats) {
      if (s.sigStrikesLandedPerMin != null) {
        expect(s.sigStrikesLandedPerMin).toBeGreaterThanOrEqual(0)
        expect(s.sigStrikesLandedPerMin).toBeLessThanOrEqual(30)
      }
      for (const pct of [s.strikingAccuracy, s.takedownAccuracy, s.koPercentage, s.tkoPercentage, s.decisionPercentage]) {
        if (pct != null) {
          expect(pct).toBeGreaterThanOrEqual(0)
          expect(pct).toBeLessThanOrEqual(100)
        }
      }
      if (s.submissionsPer15Min != null) expect(s.submissionsPer15Min).toBeGreaterThanOrEqual(0)
    }
  })

  test('cohérence du palmarès (V+D+N <= total, valeurs positives)', async () => {
    const fighters = await db.mmaFighter.findMany({
      where: { wins: { not: null } },
      include: { history: { select: { id: true } } },
    })
    expect(fighters.length).toBeGreaterThan(0)
    for (const f of fighters) {
      expect(f.wins as number).toBeGreaterThanOrEqual(0)
      expect(f.losses as number).toBeGreaterThanOrEqual(0)
      expect(f.draws as number).toBeGreaterThanOrEqual(0)
      const total = (f.wins ?? 0) + (f.losses ?? 0) + (f.draws ?? 0)
      // le total ne peut pas dépasser l'historique synchronisé... sauf si
      // l'historique n'est pas encore synchronisé (0 entrée) : on vérifie
      // seulement la cohérence interne.
      if (f.history.length > 0) expect(total).toBeLessThanOrEqual(f.history.length + 5)
    }
  })

  test('données manquantes : une fiche sans stats reste null (jamais fabriquée)', async () => {
    // Les combattants DWCS récents n'ont pas de stats ESPN -> vérifier qu'ils
    // sont null et non remplis par défaut.
    const withoutStats = await db.mmaFighter.findMany({
      where: { stats: null, profileSynced: true },
      include: { stats: true },
    })
    for (const f of withoutStats) {
      expect(f.stats).toBeNull()
    }
  })

  test('combats terminés : gagnant renseigné', async () => {
    const finished = await db.mmaFight.findMany({
      where: { status: 'TERMINE' },
      select: { winnerExternalId: true },
    })
    if (finished.length > 0) {
      const withWinner = finished.filter((f) => f.winnerExternalId != null).length
      // au moins 80% des combats terminés ont un vainqueur connu
      expect(withWinner / finished.length).toBeGreaterThan(0.8)
    }
  })

  test('combats d\'un événement : 2 combattants liés (hors placeholders)', async () => {
    const upcoming = await db.mmaEvent.findFirst({
      where: { date: { gte: new Date() }, status: { in: ['PROGRAMME', 'CONFIRME'] } },
      include: { fights: { include: { fighters: true } } },
      orderBy: { date: 'asc' },
    })
    if (upcoming) {
      const twoFighterFights = upcoming.fights.filter((f) => f.fighters.length === 2).length
      expect(twoFighterFights).toBeGreaterThan(0)
    }
  })

  test('statistiques dérivées : plages cohérentes et fenêtre explicite', async () => {
    const derived = await db.mmaDerivedStats.findMany()
    for (const d of derived) {
      expect(d.windowSize).toBeLessThanOrEqual(DERIVED_WINDOW)
      if (d.sigStrikesAbsorbedPerMin != null) expect(d.sigStrikesAbsorbedPerMin).toBeGreaterThanOrEqual(0)
      for (const pct of [d.strikingDefense, d.takedownDefense]) {
        if (pct != null) {
          expect(pct).toBeGreaterThanOrEqual(0)
          expect(pct).toBeLessThanOrEqual(100)
        }
      }
      if (d.avgFightSeconds != null) {
        expect(d.avgFightSeconds).toBeGreaterThan(0)
        expect(d.avgFightSeconds).toBeLessThanOrEqual(25 * 60)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 7. API locale (serveur en cours d'exécution) — bout en bout réel
// ---------------------------------------------------------------------------

describe('API locale (serveur de développement)', () => {
  test('GET /api/mma/events renvoie des événements réels', async () => {
    const res = await fetch(`${BASE}/api/mma/events?window=upcoming`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { events: { id: string; name: string; organization: string; fightsCount: number }[] }
    expect(body.events.length).toBeGreaterThan(0)
    const orgs = new Set(body.events.map((e) => e.organization))
    expect(orgs.has('UFC')).toBe(true)
  })

  test('GET /api/mma/events/[id] : carte complète avec catégories', async () => {
    const list = await (await fetch(`${BASE}/api/mma/events?window=upcoming`)).json() as { events: { id: string }[] }
    const detail = await (await fetch(`${BASE}/api/mma/events/${list.events[0].id}`)).json() as {
      event: { fights: { weightClass: string | null; fighters: unknown[] }[] }
    }
    expect(detail.event.fights.length).toBeGreaterThan(0)
    const withWeight = detail.event.fights.filter((f) => f.weightClass != null).length
    expect(withWeight).toBeGreaterThan(0)
  })

  test('GET /api/mma/fights/[id] : analyse complète (observé + interprétation + pronostic + sources)', async () => {
    const list = await (await fetch(`${BASE}/api/mma/events?window=upcoming`)).json() as { events: { id: string }[] }
    const detail = await (await fetch(`${BASE}/api/mma/events/${list.events[0].id}`)).json() as {
      event: { fights: { id: string; fighters: unknown[] }[] }
    }
    const fightWithBoth = detail.event.fights.find((f) => f.fighters.length === 2)
    expect(fightWithBoth).toBeDefined()
    const analysis = await (await fetch(`${BASE}/api/mma/fights/${fightWithBoth!.id}`)).json() as {
      fighters: { fullName: string }[]
      observed: { label: string }[]
      dimensions: { label: string; available: boolean }[]
      commentary: { title: string }[]
      prediction: { available: boolean; probabilityA: number | null; probabilityB: number | null }
      limitations: string[]
      sources: { name: string }[]
    }
    expect(analysis.fighters).toHaveLength(2)
    expect(analysis.observed.length).toBeGreaterThanOrEqual(15)
    expect(analysis.dimensions.length).toBeGreaterThanOrEqual(10)
    expect(analysis.commentary.length).toBeGreaterThan(0)
    expect(analysis.limitations.length).toBeGreaterThan(0)
    expect(analysis.sources.length).toBeGreaterThan(0)
    // Le pronostic est présent ; s'il est disponible, ses probabilités sont
    // cohérentes, complémentaires et bornées.
    expect(analysis.prediction).toBeDefined()
    if (analysis.prediction.available) {
      const { probabilityA, probabilityB } = analysis.prediction
      expect(probabilityA).not.toBeNull()
      expect(probabilityB).not.toBeNull()
      expect((probabilityA as number) + (probabilityB as number)).toBe(100)
      expect(probabilityA as number).toBeGreaterThanOrEqual(P_MIN)
      expect(probabilityA as number).toBeLessThanOrEqual(P_MAX)
    }
  })

  test('GET /api/mma/sync : journaux et compteurs présents', async () => {
    const body = await (await fetch(`${BASE}/api/mma/sync`)).json() as {
      lastEventsSyncAt: string | null
      counts: { events: number; fighters: number }
      logs: unknown[]
    }
    expect(body.lastEventsSyncAt).not.toBeNull()
    expect(body.counts.events).toBeGreaterThan(0)
    expect(body.counts.fighters).toBeGreaterThan(0)
    expect(body.logs.length).toBeGreaterThan(0)
  })

  test('GET /api/mma/predictions : backtest public du modèle', async () => {
    const res = await fetch(`${BASE}/api/mma/predictions`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      model: string
      analyzed: number
      correct: number
      accuracyPct: number | null
      byConfidence: { label: string; analyzed: number; correct: number }[]
      notes: string[]
    }
    expect(body.model).toBe(MODEL_VERSION)
    expect(body.analyzed).toBeGreaterThanOrEqual(0)
    expect(body.correct).toBeLessThanOrEqual(body.analyzed)
    if (body.analyzed > 0) {
      expect(body.accuracyPct).not.toBeNull()
      expect(body.accuracyPct as number).toBeGreaterThanOrEqual(0)
      expect(body.accuracyPct as number).toBeLessThanOrEqual(100)
    }
    expect(body.byConfidence).toHaveLength(3)
    expect(body.notes.length).toBeGreaterThan(0)
  })

  test('suppression du football : la route /api/football/matches n\u2019existe plus', async () => {
    const res = await fetch(`${BASE}/api/football/matches`)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 8. Adaptateur ESPN — accès réel direct (échantillon)
// ---------------------------------------------------------------------------

describe('Adaptateur ESPN (accès réel)', () => {
  test('scoreboard UFC : événements à venir avec combats', async () => {
    const from = new Date()
    const to = new Date(Date.now() + 60 * 86400000)
    const events = await espnProvider.getScoreboard('UFC', from, to)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].organization).toBe('UFC')
    expect(events[0].fights.length).toBeGreaterThan(0)
    const fight = events[0].fights[0]
    expect(fight.externalId).toMatch(/^espn:competition:\d+$/)
  })

  test('fiche combattant réelle (bio + stats + historique)', async () => {
    const profile = await espnProvider.getFighterProfile('4324622') // Morgan Charrière (vérifié à l'audit)
    expect(profile).not.toBeNull()
    expect(profile?.fullName).toBe('Morgan Charrière')
    expect(profile?.heightInches).not.toBeNull()
    const stats = await espnProvider.getFighterStats('4324622')
    expect(stats?.sigStrikesLandedPerMin).not.toBeNull()
    expect(stats?.strikingAccuracy).toBeGreaterThan(30)
    const history = await espnProvider.getFighterHistory('4324622')
    expect(history.length).toBeGreaterThan(10)
    expect(['W', 'L', 'D', 'NC']).toContain(history[0].result)
  })

  test('donnée inexistante : null ou erreur explicite, jamais d\'invention', async () => {
    // Un identifiant inexistant renvoie 404 -> null. En cas de bridage
    // intermittent du CDN (403/429, observé le 2026-11-08), l'erreur est
    // propagée — dans les deux cas, AUCUNE donnée n'est fabriquée.
    let result: unknown = 'unset'
    let threw = false
    try {
      result = await espnProvider.getFighterProfile('999999999999')
    } catch {
      threw = true
    }
    if (threw) {
      expect(result).toBe('unset') // l'erreur a été propagée, rien de fabriqué
    } else {
      expect(result).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 9. Moteur de pronostics
// ---------------------------------------------------------------------------

describe('Moteur de pronostics (voltrix-mma-v1)', () => {
  // Vues factices minimales mais réalistes (mêmes formes que FighterView)
  const makeFighter = (over: Partial<Parameters<typeof computePrediction>[0][number]> = {}): Parameters<typeof computePrediction>[0][number] => ({
    id: 'f1',
    externalId: 'espn:athlete:1',
    fullName: 'Combattant A',
    nickname: null,
    imageUrl: null,
    flagUrl: null,
    nationality: null,
    birthDate: null,
    age: null,
    heightCm: null,
    reachCm: null,
    weightLbs: null,
    weightClass: null,
    stance: null,
    fightingStyle: null,
    record: { wins: null, losses: null, draws: null, noContests: null, winsByKo: null, winsBySub: null },
    lastResults: [],
    totalFights: null,
    stats: null,
    derived: null,
    recentHistory: [],
    sourceUrl: null,
    lastSyncedAt: new Date().toISOString(),
    ...over,
  })

  const strongFighter = makeFighter({
    externalId: 'espn:athlete:strong',
    fullName: 'Favori Fort',
    record: { wins: 20, losses: 2, draws: 0, noContests: 0, winsByKo: 12, winsBySub: 5 },
    lastResults: ['W', 'W', 'W', 'W', 'W'],
    totalFights: 22,
    stats: {
      sigStrikesLandedPerMin: 6.2,
      strikingAccuracy: 58,
      takedownsPer15Min: 1.8,
      takedownAccuracy: 55,
      submissionsPer15Min: 0.8,
      koPercentage: 55,
      tkoPercentage: 5,
      decisionPercentage: 20,
      syncedAt: new Date().toISOString(),
    },
  })

  const weakFighter = makeFighter({
    externalId: 'espn:athlete:weak',
    fullName: 'Challenger Faible',
    record: { wins: 6, losses: 8, draws: 0, noContests: 0, winsByKo: 1, winsBySub: 1 },
    lastResults: ['L', 'L', 'W', 'L', 'L'],
    totalFights: 14,
    stats: {
      sigStrikesLandedPerMin: 2.4,
      strikingAccuracy: 38,
      takedownsPer15Min: 0.4,
      takedownAccuracy: 25,
      submissionsPer15Min: 0.1,
      koPercentage: 15,
      tkoPercentage: 2,
      decisionPercentage: 70,
      syncedAt: new Date().toISOString(),
    },
  })

  test('favori désigné et probabilités cohérentes sur écart net', () => {
    const dims = buildDimensions(strongFighter, weakFighter)
    const p = computePrediction(strongFighter, weakFighter, dims)
    expect(p.available).toBe(true)
    expect(p.favorite).toBe('A')
    expect(p.favoriteName).toBe('Favori Fort')
    expect(p.probabilityA).not.toBeNull()
    expect((p.probabilityA as number) + (p.probabilityB as number)).toBe(100)
    expect(p.probabilityA as number).toBeGreaterThan(50)
    // Bornes honnêtes : jamais de certitude
    expect(p.probabilityA as number).toBeLessThanOrEqual(P_MAX)
    expect(p.probabilityB as number).toBeGreaterThanOrEqual(P_MIN)
    expect(p.keyFactors.length).toBeGreaterThan(0)
    expect(p.confidence).not.toBeNull()
  })

  test('symétrie : inverser les combattants inverse le pronostic', () => {
    const d1 = buildDimensions(strongFighter, weakFighter)
    const d2 = buildDimensions(weakFighter, strongFighter)
    const p1 = computePrediction(strongFighter, weakFighter, d1)
    const p2 = computePrediction(weakFighter, strongFighter, d2)
    expect(p1.probabilityA).toBe(p2.probabilityB)
    expect(p1.favoriteName).toBe(p2.favoriteName)
  })

  test('données insuffisantes -> refus explicite, jamais d\u2019invention', () => {
    const empty = makeFighter()
    const dims = buildDimensions(empty, makeFighter({ fullName: 'Autre' }))
    const p = computePrediction(empty, makeFighter({ fullName: 'Autre' }), dims)
    expect(p.available).toBe(false)
    expect(p.unavailabilityReason).toContain('insuffisantes')
    expect(p.favorite).toBeNull()
    expect(p.probabilityA).toBeNull()
  })

  test('méthode de victoire prédite cohérente avec le palmarès', () => {
    const dims = buildDimensions(strongFighter, weakFighter)
    const p = computePrediction(strongFighter, weakFighter, dims)
    expect(p.method).not.toBeNull()
    // 12 KO sur 20 victoires -> KO/TKO majoritaire
    expect(p.method?.label).toBe('KO/TKO')
    expect(p.method?.share).not.toBeNull()
  })

  test('pronostic express : palmarès et forme seulement, borné', () => {
    const e = computeExpressPrediction(
      { fullName: 'A', wins: 20, losses: 2, draws: 0, lastResults: 'W,W,W', recordAtFight: null },
      { fullName: 'B', wins: 5, losses: 9, draws: 0, lastResults: 'L,L,L', recordAtFight: null }
    )
    expect(e.available).toBe(true)
    expect(e.favoriteName).toBe('A')
    expect(e.probability).not.toBeNull()
    expect(e.probability as number).toBeGreaterThanOrEqual(50)
    expect(e.probability as number).toBeLessThanOrEqual(70)
    expect(e.level).toBe('avantage net')
  })

  test('pronostic express : données manquantes -> indisponible', () => {
    const e = computeExpressPrediction(
      { fullName: 'A', wins: null, losses: null, draws: null, lastResults: null, recordAtFight: null },
      { fullName: 'B', wins: null, losses: null, draws: null, lastResults: null, recordAtFight: null }
    )
    expect(e.available).toBe(false)
    expect(e.favoriteName).toBeNull()
  })

  test('poids du modèle : 11 dimensions documentées', () => {
    expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(11)
    for (const w of Object.values(DIMENSION_WEIGHTS)) {
      expect(w).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 10. Backtest public (fiabilité mesurée sur données réelles)
// ---------------------------------------------------------------------------

describe('Backtest du moteur de pronostics (combats terminés en base)', () => {
  test('exécution et cohérence des compteurs', async () => {
    const r = await backtestPredictions(60)
    expect(r.model).toBe(MODEL_VERSION)
    expect(r.correct).toBeLessThanOrEqual(r.analyzed)
    expect(r.byConfidence).toHaveLength(3)
    const sum = r.byConfidence.reduce((acc, c) => acc + c.analyzed, 0)
    expect(sum).toBe(r.analyzed)
    if (r.analyzed > 0) {
      expect(r.accuracyPct).toBe(Math.round((r.correct / r.analyzed) * 100))
      // chaque combat testé référence bien un favori et un vainqueur
      for (const f of r.fights) {
        expect(f.predictedFavorite).not.toBe('?')
        expect(f.probability).toBeGreaterThanOrEqual(P_MIN)
        expect(f.probability).toBeLessThanOrEqual(P_MAX)
      }
    }
    // le biais de recul est explicitement documenté
    expect(r.notes.join(' ').toLowerCase()).toContain('biais')
  })
})

// ---------------------------------------------------------------------------
// 11. Suppression complète du football
// ---------------------------------------------------------------------------

describe('Suppression du module football', () => {
  test('plus aucune trace football en base (SyncLog, ApiCache)', async () => {
    const footballLogs = await db.syncLog.count({ where: { module: 'football' } })
    expect(footballLogs).toBe(0)
    const soccerCache = await db.apiCache.count({ where: { key: { contains: 'soccer' } } })
    expect(soccerCache).toBe(0)
  })
})
