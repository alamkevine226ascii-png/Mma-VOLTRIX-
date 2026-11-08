/**
 * MODULE MMA — Route : GET /api/mma/fights/[id]
 * Fiche complète d'un combat : présentation des combattants, informations
 * de l'événement, comparaison statistique (données observées), interprétation
 * (dimensions et indices relatifs), historique, analyse des styles, sources.
 *
 * Les indicateurs dérivés (frappes reçues/minute, défenses, temps moyen) sont
 * calculés en arrière-plan au premier appel : la réponse porte alors
 * derivedPending=true et le client peut rappeler la route.
 *
 * Paramètres :
 *  - deep=1 : attendre (bloquer) le calcul dérivé plutôt que l'arrière-plan.
 */
import { NextResponse } from 'next/server'
import { computeDerivedStats, getFightAnalysis } from '@/modules/mma/services/analysis'
import { db } from '@/lib/db'
import { DERIVED_WINDOW } from '@/modules/mma/services/analysis'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const deep = url.searchParams.get('deep') === '1'

  if (deep) {
    // Mode bloquant : calcule les statistiques dérivées avant de répondre.
    const fight = await db.mmaFight.findUnique({
      where: { id },
      include: { fighters: true },
    })
    if (!fight) return NextResponse.json({ error: 'Combat introuvable' }, { status: 404 })
    for (const ff of fight.fighters) {
      const has = await db.mmaDerivedStats.findUnique({
        where: { fighterId_windowSize: { fighterId: ff.fighterId, windowSize: DERIVED_WINDOW } },
      })
      if (!has) await computeDerivedStats(ff.fighterId).catch(() => undefined)
    }
  }

  const analysis = await getFightAnalysis(id)
  if ('error' in analysis) {
    return NextResponse.json({ error: analysis.error }, { status: 404 })
  }
  return NextResponse.json(analysis)
}
