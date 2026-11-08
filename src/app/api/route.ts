/**
 * VOLTRIX — Point d'entrée des services.
 * Route : GET /api
 * Retourne l'état du module MMA et la version.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    app: 'VOLTRIX',
    version: '2.0.0',
    modules: ['mma'],
    features: ['evenements', 'combats', 'combattants', 'statistiques', 'pronostics'],
    status: 'ok',
  })
}
