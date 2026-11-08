import { db } from '../src/lib/db'
async function main() {
  const ev = await db.mmaEvent.findFirst({ where: { name: { contains: 'UFC 334' } } })
  const fights = await db.mmaFight.findMany({ where: { eventId: ev!.id }, orderBy: { id: 'asc' } })
  for (const f of fights.slice(0, 14)) {
    console.log(f.externalId, '| seg:', f.cardSegment, '| matchNum:', f.matchNumber, '| rounds:', f.scheduledRounds)
  }
}
main().finally(() => db.$disconnect())
