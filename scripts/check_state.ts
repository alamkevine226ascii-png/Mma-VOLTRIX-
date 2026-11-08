import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  console.log('profileSynced:', await db.mmaFighter.count({ where: { profileSynced: true } }), '/', await db.mmaFighter.count())
  console.log('avec stats:', await db.mmaFighter.count({ where: { stats: { isNot: null } } }))
  console.log('avec historique:', await db.mmaFighter.count({ where: { history: { some: {} } } }))
  const liz = await db.mmaFighter.findFirst({ where: { normalizedName: 'liz carmouche' }, include: { stats: true, history: { take: 1 } } })
  if (liz) console.log('Liz:', { profileSynced: liz.profileSynced, stats: !!liz.stats, hist: liz.history.length, lastSyncedAt: liz.lastSyncedAt })
  // Vérifie un autre combattant enrichi
  const other = await db.mmaFighter.findFirst({ where: { profileSynced: true }, include: { stats: true } })
  if (other) console.log('Exemple enrichi:', other.fullName, { stats: !!other.stats, SLpM: other.stats?.sigStrikesLandedPerMin })
}
main().finally(() => db.$disconnect())
