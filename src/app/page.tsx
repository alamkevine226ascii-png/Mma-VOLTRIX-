'use client'

/**
 * VOLTRIX — Page principale (route unique).
 * Architecture conservée : onglets Accueil / Paramètres.
 * Dans l'Accueil, un sélecteur de discipline : Football | MMA.
 */
import { useState } from 'react'
import { Trophy, Swords } from 'lucide-react'
import { AppShell, type MainTab } from '@/components/voltrix/AppShell'
import { SettingsView } from '@/components/voltrix/SettingsView'
import { FootballView } from '@/components/football/FootballView'
import { MmaView } from '@/components/mma/MmaView'
import { cn } from '@/lib/utils'

type Discipline = 'football' | 'mma'

export default function Home() {
  const [tab, setTab] = useState<MainTab>('accueil')
  const [discipline, setDiscipline] = useState<Discipline>('football')

  return (
    <AppShell tab={tab} onTabChange={setTab}>
      {tab === 'parametres' ? (
        <SettingsView />
      ) : (
        <div className="space-y-6">
          {/* Sélecteur de discipline */}
          <div className="flex justify-center" role="tablist" aria-label="Discipline">
            <div className="glass rounded-2xl p-1.5 inline-flex gap-1.5">
              <DisciplineButton
                active={discipline === 'football'}
                onClick={() => setDiscipline('football')}
                icon={<Trophy className="h-4 w-4" aria-hidden="true" />}
                label="Football"
                activeClass="text-emerald-200 border-emerald-300/25 bg-emerald-400/10"
              />
              <DisciplineButton
                active={discipline === 'mma'}
                onClick={() => setDiscipline('mma')}
                icon={<Swords className="h-4 w-4" aria-hidden="true" />}
                label="MMA"
                activeClass="text-rose-200 border-rose-300/25 bg-rose-400/10"
              />
            </div>
          </div>

          {discipline === 'football' ? <FootballView /> : <MmaView />}
        </div>
      )}
    </AppShell>
  )
}

function DisciplineButton({
  active,
  onClick,
  icon,
  label,
  activeClass,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  activeClass: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl px-5 sm:px-7 h-11 text-sm font-semibold transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
        active ? activeClass : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-white/5'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
