/**
 * VOLTRIX — Tests des fonctions pures du frontend (bun test, sans serveur).
 * Couvre : mappages de statuts, durées, palmarès, normalisation, détection
 * de placeholders, moteur de pronostics (bornes, symétrie, refus), pronostic
 * express. Aucune requête réseau, aucune base de données.
 */
import { describe, expect, test } from 'bun:test'
import {
  fightDurationSeconds,
  formScore,
  inchesToCm,
  isPlaceholderFighter,
  lastResultsFromHistory,
  mapEspnStatus,
  mapResultMethod,
  normalizeName,
  parseRecord,
  resultMethodDetail,
  weightClassFr,
} from '@/lib/mma/types'
import { buildDimensions, toFighterView, type FighterBundle } from '@/lib/mma/analysis'
import {
  computePrediction,
  computeExpressPrediction,
  DIMENSION_WEIGHTS,
  P_MIN,
  P_MAX,
  MODEL_VERSION,
} from '@/lib/mma/prediction'
import type { FighterView } from '@/lib/mma/analysis'

// ---------------------------------------------------------------------------
// 1. Mappages et formules
// ---------------------------------------------------------------------------

describe('Mappages et formules', () => {
  const future = new Date(Date.now() + 86400000)
  const past = new Date(Date.now() - 86400000)

  test('statuts ESPN -> VOLTRIX', () => {
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_SCHEDULED' }, future)).toBe('PROGRAMME')
    expect(mapEspnStatus({ state: 'in', name: 'STATUS_IN_PROGRESS' }, future)).toBe('EN_COURS')
    expect(mapEspnStatus({ state: 'post', name: 'STATUS_FINAL', completed: true }, past)).toBe('TERMINE')
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_POSTPONED' }, future)).toBe('REPORTE')
    expect(mapEspnStatus({ state: 'pre', name: 'STATUS_CANCELED' }, future)).toBe('ANNULE')
    expect(mapEspnStatus(null, past)).toBe('TERMINE')
    expect(mapEspnStatus(null, future)).toBe('PROGRAMME')
  })

  test('durée de combat (cas réels validés)', () => {
    expect(fightDurationSeconds({ clock: 122, period: 1 })).toBe(178)
    expect(fightDurationSeconds({ clock: 164, period: 3 })).toBe(2 * 300 + 136)
    expect(fightDurationSeconds({ clock: 300, period: 3 })).toBe(900)
    expect(fightDurationSeconds(null)).toBeNull()
  })

  test('palmarès et noms', () => {
    expect(parseRecord('10-2-0')).toEqual({ wins: 10, losses: 2, draws: 0 })
    expect(parseRecord('n/d')).toBeNull()
    expect(normalizeName('José Aldò Júnior!')).toBe('jose aldo junior')
    expect(inchesToCm(70)).toBe(177.8)
    expect(inchesToCm(null)).toBeNull()
    expect(weightClassFr('Lightweight')).toBe('Léger')
    expect(weightClassFr('Unknown')).toBe('Unknown')
  })

  test('méthodes de victoire', () => {
    expect(mapResultMethod('kotko')).toBe('KO_TKO')
    expect(mapResultMethod('decision---unanimous')).toBe('DECISION')
    expect(resultMethodDetail({ name: 'decision---split' }).detail).toContain('partagée')
  })

  test('forme récente', () => {
    expect(formScore('W,W,W,W,W')).toBe(1)
    expect(formScore('L,L,L,L,L')).toBe(0)
    expect(formScore(null)).toBeNull()
    const hist = [
      { result: 'W', eventDate: '2026-01-01' },
      { result: 'L', eventDate: '2026-02-01' },
      { result: 'W', eventDate: '2026-03-01' },
    ]
    expect(lastResultsFromHistory(hist)).toBe('W,L,W')
  })

  test('placeholders TBA/TBD', () => {
    expect(isPlaceholderFighter('TBA')).toBe(true)
    expect(isPlaceholderFighter('Opponent TBA')).toBe(true)
    expect(isPlaceholderFighter('Ciryl Gane')).toBe(false)
    expect(isPlaceholderFighter('Tabatha Ricci')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Moteur de pronostics (fonctions pures)
// ---------------------------------------------------------------------------

describe('Moteur de pronostics (voltrix-mma-v1, frontend)', () => {
  const makeFighter = (over: Partial<FighterView> = {}): FighterView => ({
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

  const strong = makeFighter({
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

  const weak = makeFighter({
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

  test('favori désigné et probabilités bornées sur écart net', () => {
    const dims = buildDimensions(strong, weak)
    const p = computePrediction(strong, weak, dims)
    expect(p.available).toBe(true)
    expect(p.favorite).toBe('A')
    expect((p.probabilityA as number) + (p.probabilityB as number)).toBe(100)
    expect(p.probabilityA as number).toBeGreaterThan(50)
    expect(p.probabilityA as number).toBeLessThanOrEqual(P_MAX)
    expect(p.probabilityB as number).toBeGreaterThanOrEqual(P_MIN)
    expect(p.model.version).toBe(MODEL_VERSION)
  })

  test('symétrie : inverser les combattants inverse le pronostic', () => {
    const p1 = computePrediction(strong, weak, buildDimensions(strong, weak))
    const p2 = computePrediction(weak, strong, buildDimensions(weak, strong))
    expect(p1.probabilityA).toBe(p2.probabilityB)
    expect(p1.favoriteName).toBe(p2.favoriteName)
  })

  test('données insuffisantes -> refus explicite', () => {
    const empty = makeFighter()
    const other = makeFighter({ fullName: 'Autre' })
    const p = computePrediction(empty, other, buildDimensions(empty, other))
    expect(p.available).toBe(false)
    expect(p.unavailabilityReason).toContain('insuffisantes')
    expect(p.probabilityA).toBeNull()
  })

  test('méthode prédite cohérente avec le palmarès (12 KO / 20 victoires)', () => {
    const p = computePrediction(strong, weak, buildDimensions(strong, weak))
    expect(p.method?.label).toBe('KO/TKO')
    expect(p.method?.share).toBe(60)
  })

  test('pronostic express : borné et refus sans données', () => {
    const e = computeExpressPrediction(
      { fullName: 'A', wins: 20, losses: 2, draws: 0, lastResults: 'W,W,W', recordAtFight: null },
      { fullName: 'B', wins: 5, losses: 9, draws: 0, lastResults: 'L,L,L', recordAtFight: null }
    )
    expect(e.available).toBe(true)
    expect(e.favoriteName).toBe('A')
    expect(e.level).toBe('avantage net')
    const none = computeExpressPrediction(
      { fullName: 'A', wins: null, losses: null, draws: null, lastResults: null, recordAtFight: null },
      { fullName: 'B', wins: null, losses: null, draws: null, lastResults: null, recordAtFight: null }
    )
    expect(none.available).toBe(false)
  })

  test('11 dimensions pondérées, toutes positives', () => {
    expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(11)
    for (const w of Object.values(DIMENSION_WEIGHTS)) expect(w).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Construction des vues combattant depuis les DTO ESPN
// ---------------------------------------------------------------------------

describe('toFighterView (DTO ESPN -> vue)', () => {
  test('bundle complet -> champs corrects, valeurs manquantes à null', () => {
    const bundle: FighterBundle = {
      profile: {
        externalId: 'espn:athlete:42',
        espnAthleteId: '42',
        fullName: 'Morgan Charrière',
        nickname: 'The Last Pirate',
        birthDate: '1993-06-14T00:00:00Z',
        nationality: 'France',
        heightInches: 69,
        reachInches: 71,
        weightLbs: 145,
        weightClass: 'Featherweight',
        stance: 'Orthodox',
        fightingStyle: 'Striker',
        active: true,
        imageUrl: 'https://a.espncdn.com/x.jpg',
        flagUrl: null,
        sourceUrl: 'https://www.espn.com/mma/fighter/_/id/42',
      },
      stats: {
        sigStrikesLandedPerMin: 5.1,
        strikingAccuracy: 52,
        takedownsPer15Min: 0.8,
        takedownAccuracy: 40,
        submissionsPer15Min: 0.6,
        koPercentage: 35,
        tkoPercentage: 10,
        decisionPercentage: 30,
      },
      record: { wins: 20, losses: 4, draws: 1, noContests: 0, winsByKo: 9, winsBySub: 5, titleWins: 1 },
      history: [
        { externalFightKey: 'k1', espnEventId: '1', espnCompetitionId: '1', espnLeagueId: '3321', eventName: 'E1', eventDate: '2026-01-01T00:00:00Z', result: 'W', opponentName: 'X', opponentExternalId: 'espn:athlete:9', titleFight: false },
        { externalFightKey: 'k2', espnEventId: '2', espnCompetitionId: '2', espnLeagueId: '3321', eventName: 'E2', eventDate: '2026-02-01T00:00:00Z', result: 'L', opponentName: 'Y', opponentExternalId: 'espn:athlete:8', titleFight: true },
      ],
      derived: null,
    }
    const v = toFighterView(bundle)
    expect(v.fullName).toBe('Morgan Charrière')
    expect(v.age).toBeGreaterThan(30)
    expect(v.heightCm).toBeCloseTo(175.3, 0)
    expect(v.record.wins).toBe(20)
    expect(v.totalFights).toBe(25)
    expect(v.lastResults).toEqual(['L', 'W'])
    expect(v.recentHistory[0].opponentName).toBe('Y')
    expect(v.recentHistory[0].titleFight).toBe(true)
    expect(v.stats?.sigStrikesLandedPerMin).toBe(5.1)
    expect(v.derived).toBeNull()
  })

  test('bundle vide -> aucune valeur fabriquée', () => {
    const v = toFighterView({ profile: null, stats: null, record: null, history: [], derived: null })
    expect(v.fullName).toBe('Combattant')
    expect(v.age).toBeNull()
    expect(v.stats).toBeNull()
    expect(v.record.wins).toBeNull()
    expect(v.totalFights).toBeNull()
    expect(v.lastResults).toEqual([])
  })
})
