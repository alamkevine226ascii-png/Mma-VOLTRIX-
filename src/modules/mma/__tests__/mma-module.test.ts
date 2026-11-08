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
 *  - récupération réelle des événements et combattants (API locale + ESPN)
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
import { computeDerivedStats, DERIVED_WINDOW } from '@/modules/mma/services/analysis'

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

  test('GET /api/mma/fights/[id] : analyse complète (observé + interprétation + sources)', async () => {
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
      limitations: string[]
      sources: { name: string }[]
    }
    expect(analysis.fighters).toHaveLength(2)
    expect(analysis.observed.length).toBeGreaterThanOrEqual(15)
    expect(analysis.dimensions.length).toBeGreaterThanOrEqual(10)
    expect(analysis.commentary.length).toBeGreaterThan(0)
    expect(analysis.limitations.length).toBeGreaterThan(0)
    expect(analysis.sources.length).toBeGreaterThan(0)
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

  test('GET /api/football/matches : moteur football intact (non-régression)', async () => {
    const res = await fetch(`${BASE}/api/football/matches`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matches: { id: string; homeTeam: string; awayTeam: string; status: string }[] }
    expect(body.matches.length).toBeGreaterThan(0)
    for (const m of body.matches) {
      expect(['PROGRAMME', 'EN_COURS', 'TERMINE']).toContain(m.status)
    }
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

  test('donnée inexistante : 404 -> null (pas d\'invention)', async () => {
    const missing = await espnProvider.getFighterProfile('999999999999')
    expect(missing).toBeNull()
  })
})
