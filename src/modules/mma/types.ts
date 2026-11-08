/**
 * MODULE MMA — Types du domaine, mappages de statuts et utilitaires.
 * Chaque règle de correspondance fournisseur -> domaine est documentée ici
 * et testée dans src/modules/mma/__tests__/types.test.ts
 */

/** Statuts de combat/événement exigés par VOLTRIX (+ EN_COURS pour le direct). */
export const FIGHT_STATUSES = [
  'PROGRAMME',
  'CONFIRME',
  'REPORTE',
  'ANNULE',
  'TERMINE',
  'EN_COURS',
] as const
export type FightStatus = (typeof FIGHT_STATUSES)[number]

export const FIGHT_STATUS_LABELS: Record<FightStatus, string> = {
  PROGRAMME: 'Programmé',
  CONFIRME: 'Confirmé',
  REPORTE: 'Reporté',
  ANNULE: 'Annulé',
  TERMINE: 'Terminé',
  EN_COURS: 'En cours',
}

export const FIGHT_STATUS_COLORS: Record<FightStatus, string> = {
  PROGRAMME: 'text-amber-300 bg-amber-400/10 border-amber-400/30',
  CONFIRME: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30',
  REPORTE: 'text-orange-300 bg-orange-400/10 border-orange-400/30',
  ANNULE: 'text-red-300 bg-red-400/10 border-red-400/30',
  TERMINE: 'text-zinc-300 bg-zinc-400/10 border-zinc-400/30',
  EN_COURS: 'text-rose-300 bg-rose-400/10 border-rose-400/30',
}

export type ResultMethod = 'KO_TKO' | 'SOUMISSION' | 'DECISION'

export const RESULT_METHOD_LABELS: Record<ResultMethod, string> = {
  KO_TKO: 'KO/TKO',
  SOUMISSION: 'Soumission',
  DECISION: 'Décision',
}

/** Garde traduite. */
export const STANCE_LABELS: Record<string, string> = {
  Orthodox: 'Orthodoxe',
  Southpaw: 'Gaucher',
  Switch: 'Alterné',
  'Open Stance': 'Ouverte',
}

export const ORGANIZATIONS = ['UFC', 'PFL', 'BELLATOR'] as const
export type Organization = (typeof ORGANIZATIONS)[number]

export const ORG_LABELS: Record<Organization, string> = {
  UFC: 'UFC',
  PFL: 'PFL',
  BELLATOR: 'Bellator',
}

/** Catégories de poids connues (affichage FR + ordre). */
export const WEIGHT_CLASS_FR: Record<string, string> = {
  'Strawweight': 'Paille',
  'Flyweight': 'Mouche',
  'Bantamweight': 'Coq',
  'Featherweight': 'Plume',
  'Lightweight': 'Léger',
  'Welterweight': 'Welter',
  'Middleweight': 'Moyen',
  'Light Heavyweight': 'Mi-lourd',
  'Heavyweight': 'Lourd',
  "Women's Strawweight": 'Paille (F)',
  "Women's Flyweight": 'Mouche (F)',
  "Women's Bantamweight": 'Coq (F)',
  "Women's Featherweight": 'Plume (F)',
  'Catchweight': 'Poids contracté',
}

export function weightClassFr(name?: string | null): string | undefined {
  if (!name) return undefined
  return WEIGHT_CLASS_FR[name] ?? name
}

/**
 * Correspondance statut ESPN -> statut VOLTRIX.
 * Règles (validées sur données réelles du 2026-11-08) :
 *  - state "pre"  : STATUS_POSTPONED -> REPORTE ; contient CANCEL -> ANNULE ; sinon PROGRAMME
 *    (un combat PROGRAMME passe à CONFIRME quand ses données sont complètes, règle VOLTRIX)
 *  - state "in"   : EN_COURS
 *  - state "post" : completed -> TERMINE (contient CANCEL -> ANNULE)
 *  - état inconnu : repli sur la date (futur -> PROGRAMME, passé -> TERMINE), rawStatus conservé
 */
export interface RawStatusInfo {
  state?: string | null
  name?: string | null
  completed?: boolean | null
}

export function mapEspnStatus(raw: RawStatusInfo | null | undefined, date: Date): FightStatus {
  const state = raw?.state ?? ''
  const name = (raw?.name ?? '').toUpperCase()
  if (name.includes('CANCEL')) return 'ANNULE'
  if (state === 'pre') {
    if (name.includes('POSTPONED') || name.includes('DELAYED')) return 'REPORTE'
    return 'PROGRAMME'
  }
  if (state === 'in') return 'EN_COURS'
  if (state === 'post') {
    if (name.includes('POSTPONED')) return 'REPORTE'
    return 'TERMINE'
  }
  // État non reconnu : repli honnête fondé sur la date
  return date.getTime() > Date.now() ? 'PROGRAMME' : 'TERMINE'
}

/** Méthode de victoire depuis le champ status.result.name de l'API (ex: "kotko", "decision---unanimous"). */
export function mapResultMethod(resultName?: string | null): ResultMethod | null {
  if (!resultName) return null
  const n = resultName.toLowerCase()
  if (n.includes('ko') || n.includes('tko')) return 'KO_TKO'
  if (n.includes('submission') || n.includes('sub')) return 'SOUMISSION'
  if (n.includes('decision')) return 'DECISION'
  return null
}

/** Méthode de victoire lisible (avec nuance ex: décision unanime). */
export function resultMethodDetail(result?: { name?: string | null; description?: string | null } | null): {
  method: ResultMethod | null
  detail: string | null
} {
  if (!result) return { method: null, detail: null }
  const method = mapResultMethod(result.name)
  let detail: string | null = null
  if (method === 'DECISION') {
    const n = (result.name ?? '').toLowerCase()
    if (n.includes('unanimous')) detail = 'Décision unanime'
    else if (n.includes('split')) detail = 'Décision partagée'
    else if (n.includes('majority')) detail = 'Décision majoritaire'
    else detail = 'Décision'
    if (result.description) detail += ` — ${result.description}`
  } else if (method) {
    detail = `${RESULT_METHOD_LABELS[method]}${result.description ? ` — ${result.description}` : ''}`
  }
  return { method, detail }
}

/**
 * Durée d'un combat terminé, en secondes.
 * Formule VALIDÉE sur données réelles (4 combats vérifiés le 2026-11-08) :
 *  - horloge < 300 s (arrêt avant la fin du round)  : (period - 1) * 300 + (300 - clock)
 *  - horloge = 300 s (combat mené à son terme)       : period * 300
 * Retourne null si les données sont insuffisantes.
 */
export function fightDurationSeconds(status?: { clock?: number | null; period?: number | null } | null): number | null {
  if (!status || status.clock == null || status.period == null) return null
  const clock = Number(status.clock)
  const period = Number(status.period)
  if (!Number.isFinite(clock) || !Number.isFinite(period) || period < 1) return null
  const ROUND = 300
  if (clock >= ROUND) return period * ROUND
  return (period - 1) * ROUND + (ROUND - clock)
}

/** Palmarès "10-2-0" -> { wins: 10, losses: 2, draws: 0 } ; null si non analysable. */
export function parseRecord(summary?: string | null): { wins: number; losses: number; draws: number } | null {
  if (!summary) return null
  const m = summary.trim().match(/^(\d+)-(\d+)-(\d+)$/)
  if (!m) return null
  return { wins: Number(m[1]), losses: Number(m[2]), draws: Number(m[3]) }
}

/**
 * Normalisation de nom pour le dédoublonnage inter-sources :
 * minuscules, sans accents, sans ponctuation, espaces simples.
 */
export function normalizeName(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pouces -> centimètres (arrondi 0,1). */
export function inchesToCm(inches: number | null | undefined): number | null {
  if (inches == null || !Number.isFinite(Number(inches))) return null
  return Math.round(Number(inches) * 2.54 * 10) / 10
}

/** Résultat récent -> forme. Renvoie la suite la plus récente d'abord, ex: "W,W,L,W,W". */
export function lastResultsFromHistory(history: { result: string; eventDate: Date }[], count = 5): string | null {
  const sorted = [...history].sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
  return sorted
    .filter((h) => ['W', 'L', 'D', 'NC'].includes(h.result))
    .slice(0, count)
    .map((h) => h.result)
    .join(',') || null
}

/** Score de forme : W=1, D=0.5, NC exclu, L=0 — sur les n derniers résultats. */
export function formScore(lastResults: string | null | null, count = 5): number | null {
  if (!lastResults) return null
  const results = lastResults.split(',').filter(Boolean).slice(0, count)
  if (results.length === 0) return null
  const total = results.reduce((acc, r) => acc + (r === 'W' ? 1 : r === 'D' ? 0.5 : 0), 0)
  return total / results.length
}
