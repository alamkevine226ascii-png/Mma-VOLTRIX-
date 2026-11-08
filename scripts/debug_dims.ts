import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const fight = await db.mmaFight.findFirst({
    where: { status: 'TERMINE', winnerExternalId: { not: null } },
    include: { fighters: { include: { fighter: { include: { stats: true, derived: true, history: true } } } } },
    orderBy: { updatedAt: 'desc' },
  })
  if (!fight) return console.log('aucun combat')
  console.log('Combat:', fight.externalId, '| winner:', fight.winnerExternalId)
  for (const ff of fight.fighters) {
    const f = ff.fighter
    console.log(' ', f.fullName, '| extId:', f.externalId, '| synced:', f.profileSynced, '| stats:', !!f.stats, '| hist:', f.history.length, '| lastRes:', f.lastResults, '| wins:', f.wins, '| SLpM:', f.stats?.sigStrikesLandedPerMin)
  }
  // Charge le module et calcule les dimensions
  const { toFighterView, buildDimensions } = await import('../src/modules/mma/services/analysis')
  const { computePrediction } = await import('../src/modules/mma/services/prediction')
  const [fa, fb] = fight.fighters.map((x) => x.fighter)
  const va = toFighterView(fa)
  const vb = toFighterView(fb)
  const dims = buildDimensions(va, vb)
  for (const d of dims) console.log(' ', d.key.padEnd(20), 'available:', d.available, 'A:', d.scoreA, 'B:', d.scoreB)
  const p = computePrediction(va, vb, dims)
  console.log('Pronostic available:', p.available, '| reason:', p.unavailabilityReason)
}
main().finally(() => db.$disconnect())
