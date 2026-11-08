/**
 * Nettoyage post-suppression du module football :
 *  - journaux de synchronisation football (SyncLog)
 *  - entrées de cache soccer (ApiCache)
 * À exécuter une fois après `bun run db:push` (qui supprime la table FootballMatch).
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const logs = await db.syncLog.deleteMany({ where: { module: 'football' } })
  console.log('SyncLog football supprimés :', logs.count)
  const cache = await db.apiCache.deleteMany({ where: { key: { contains: 'soccer' } } })
  console.log('ApiCache soccer supprimés :', cache.count)
  // Vérification finale
  const remainingFootballLogs = await db.syncLog.count({ where: { module: 'football' } })
  const remainingSoccerCache = await db.apiCache.count({ where: { key: { contains: 'soccer' } } })
  console.log('Vérification — SyncLog football restants :', remainingFootballLogs)
  console.log('Vérification — ApiCache soccer restants :', remainingSoccerCache)
  console.log('Compteurs MMA :', {
    events: await db.mmaEvent.count(),
    fights: await db.mmaFight.count(),
    fighters: await db.mmaFighter.count(),
    finishedFights: await db.mmaFight.count({ where: { status: 'TERMINE' } }),
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
