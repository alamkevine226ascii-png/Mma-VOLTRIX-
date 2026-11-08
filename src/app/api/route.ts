/**
 * VOLTRIX — Point d'entrée des services.
 * Route : GET /api
 * Retourne l'état des modules (football, mma) et la version.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    app: 'VOLTRIX',
    version: '1.1.0',
    modules: ['football', 'mma'],
    status: 'ok',
  })
}
