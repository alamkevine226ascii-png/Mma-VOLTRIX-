/**
 * MODULE FOOTBALL — Route : GET /api/football/matches
 * Liste les matchs de football sur la fenêtre [-2 j ; +7 j] par championnat.
 * Déclenche une synchronisation si les données ont plus de 10 minutes.
 * Moteur football isolé : ne dépend d'aucun module MMA.
 */
import { NextResponse } from 'next/server'
import { ensureFreshFootball, listFootballMatches, FOOTBALL_LEAGUES } from '@/modules/football/service'

export async function GET() {
  let syncStatus: string | null = null
  try {
    await ensureFreshFootball()
  } catch {
    syncStatus = 'synchro échouée (données locales)'
  }
  const matches = await listFootballMatches()
  return NextResponse.json({
    matches,
    leagues: FOOTBALL_LEAGUES,
    syncStatus,
  })
}
