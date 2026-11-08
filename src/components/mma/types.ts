'use client'

/**
 * MODULE MMA — Types et constantes côté client.
 * Les formes de données sont produites par les loaders navigateur
 * (src/lib/mma/loaders.ts) : interfaces ré-exportées depuis la couche lib.
 */
import type {
  MmaEventDetail,
  MmaEventListItem,
  MmaEventsResponse,
  FightContext,
  ModelCheckResult,
} from '@/lib/mma/loaders'
import type {
  FighterView,
  FightAnalysis,
  ObservedRow,
  DimensionScore,
  CommentaryBlock,
} from '@/lib/mma/analysis'
import type {
  PredictionView,
  ExpressPredictionView,
  PredictionFactor,
} from '@/lib/mma/prediction'

export type {
  MmaEventDetail,
  MmaEventListItem,
  MmaEventsResponse,
  FightContext,
  ModelCheckResult,
  FighterView,
  FightAnalysis,
  ObservedRow,
  DimensionScore,
  CommentaryBlock,
  PredictionView,
  ExpressPredictionView,
  PredictionFactor,
}

export const STATUS_LABELS: Record<string, string> = {
  PROGRAMME: 'Programmé',
  CONFIRME: 'Confirmé',
  REPORTE: 'Reporté',
  ANNULE: 'Annulé',
  TERMINE: 'Terminé',
  EN_COURS: 'En cours',
}

export const STATUS_CLASSES: Record<string, string> = {
  PROGRAMME: 'text-amber-200 bg-amber-400/10 border-amber-300/25',
  CONFIRME: 'text-emerald-200 bg-emerald-400/10 border-emerald-300/25',
  REPORTE: 'text-orange-200 bg-orange-400/10 border-orange-300/25',
  ANNULE: 'text-red-200 bg-red-400/10 border-red-300/25',
  TERMINE: 'text-zinc-300 bg-zinc-400/10 border-zinc-300/25',
  EN_COURS: 'text-rose-200 bg-rose-400/10 border-rose-300/25',
}

export const ORG_STYLES: Record<string, { label: string; badge: string }> = {
  UFC: { label: 'UFC', badge: 'text-rose-200 bg-rose-500/15 border-rose-400/30' },
  PFL: { label: 'PFL', badge: 'text-emerald-200 bg-emerald-500/15 border-emerald-400/30' },
  BELLATOR: { label: 'Bellator', badge: 'text-amber-200 bg-amber-500/15 border-amber-400/30' },
}

export const RESULT_LABELS: Record<string, string> = {
  W: 'V',
  L: 'D',
  D: 'N',
  NC: 'NC',
}
