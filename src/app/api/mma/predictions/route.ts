/**
 * MODULE MMA — Route : GET /api/mma/predictions
 * Fiabilité publique du moteur de pronostics : le modèle est recalculé sur
 * les combats terminés en base (backtest) et confronté aux vainqueurs réels.
 * Le résultat est publié tel quel, y compris s'il est défavorable.
 *
 * Réponse : BacktestResult (modèle, échantillon, taux de réussite,
 * ventilation par niveau de fiabilité, derniers combats testés, notes).
 */
import { NextResponse } from 'next/server'
import { backtestPredictions } from '@/modules/mma/services/backtest'

export async function GET() {
  try {
    const result = await backtestPredictions(80)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'Backtest indisponible', detail: err instanceof Error ? err.message : 'erreur inconnue' },
      { status: 500 }
    )
  }
}
