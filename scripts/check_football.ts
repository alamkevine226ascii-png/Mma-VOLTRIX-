import { db } from '../src/lib/db'
async function main() {
  const matches = await db.footballMatch.count()
  console.log('FootballMatch en base:', matches)
  const logs = await db.syncLog.findMany({ where: { module: 'football' }, orderBy: { startedAt: 'desc' }, take: 2 })
  for (const l of logs) console.log('log:', l.status, '| fetched:', l.itemsFetched, '| updated:', l.itemsUpdated, '| erreurs:', (l.errors ?? '').slice(0, 300))
}
main().finally(() => db.$disconnect())
