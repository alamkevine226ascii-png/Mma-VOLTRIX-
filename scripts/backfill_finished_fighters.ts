/**
 * BACKFILL — Enrichissement des combattants des combats TERMINÉS.
 *
 * Pourquoi : l'ordonnanceur enrichit les combattants des événements à venir ;
 * ceux des événements passés n'avaient jamais été enrichis (pas de stats de
 * carrière, pas d'historique). Le backtest du moteur de pronostics a besoin
 * de ces données pour confronter le modèle aux vainqueurs réels.
 *
 * Usage : DATABASE_URL="file:/home/z/my-project/db/custom.db" \
 *         bun run scripts/backfill_finished_fighters.ts
 * Sortie : scripts/backfill_result.json (compteurs + erreurs)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Combattants impliqués dans des combats terminés, pas encore enrichis
  const finishedFights = await db.mmaFight.findMany({
    where: { status: 'TERMINE' },
    select: { fighters: { select: { fighterId: true } } },
  })
  const ids = [
    ...new Set(finishedFights.flatMap((f) => f.fighters.map((ff) => ff.fighterId))),
  ]
  const notSynced: string[] = []
  for (const id of ids) {
    const f = await db.mmaFighter.findUnique({ where: { id }, select: { profileSynced: true } })
    if (f && !f.profileSynced) notSynced.push(id)
  }
  console.log(`Combattants de combats terminés : ${ids.length}, à enrichir : ${notSynced.length}`)

  // Import dynamique du service (partage le cache/limitation de débit du module)
  const { enrichFighter } = await import('../src/modules/mma/services/sync')

  let ok = 0
  let partial = 0
  let fail = 0
  const errors: string[] = []
  const started = Date.now()
  let i = 0
  for (const id of notSynced) {
    i++
    try {
      const res = await enrichFighter(id)
      if (!res.ok) {
        fail++
        errors.push(`${id}: ${res.errors.join(' | ')}`)
      } else if (res.errors.length > 0) {
        // enrichi partiellement : au moins une étape en erreur (ex. 403 CDN)
        partial++
        errors.push(`${id} (partiel): ${res.errors.join(' | ')}`)
      } else {
        ok++
      }
    } catch (err) {
      fail++
      errors.push(`${id}: ${err instanceof Error ? err.message : 'erreur'}`)
    }
    if (i % 10 === 0 || i === notSynced.length) {
      console.log(`[${i}/${notSynced.length}] complets=${ok} partiels=${partial} echecs=${fail} (${((Date.now() - started) / 1000).toFixed(0)}s)`)
    }
  }

  const summary = {
    total: notSynced.length,
    ok,
    partial,
    fail,
    durationSec: Math.round((Date.now() - started) / 1000),
    errors: errors.slice(0, 40),
  }
  await Bun.write('scripts/backfill_result.json', JSON.stringify(summary, null, 2))
  console.log('Terminé :', JSON.stringify({ ...summary, errors: `${errors.length} entrée(s) d'erreur` }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
