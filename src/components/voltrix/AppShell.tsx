'use client'

/**
 * VOLTRIX — Coquille applicative « Glass & Layered ».
 * Architecture conservée : deux onglets principaux, Accueil et Paramètres.
 */
import { Zap, Settings, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MainTab = 'accueil' | 'parametres'

interface AppShellProps {
  tab: MainTab
  onTabChange: (tab: MainTab) => void
  children: React.ReactNode
}

export function AppShell({ tab, onTabChange, children }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40">
        <div className="glass border-x-0 border-t-0">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 border border-violet-300/20">
                <Zap className="h-5 w-5 text-violet-300" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold tracking-tight leading-none">
                  <span className="voltrix-gradient-text">VOLTRIX</span>
                </p>
                <p className="text-[11px] text-zinc-500 leading-tight truncate">
                  MMA · 100 % frontend · pronostics sourcés
                </p>
              </div>
            </div>

            <nav aria-label="Navigation principale" className="flex items-center gap-1.5">
              <TabButton
                active={tab === 'accueil'}
                onClick={() => onTabChange('accueil')}
                icon={<Home className="h-4 w-4" aria-hidden="true" />}
                label="Accueil"
              />
              <TabButton
                active={tab === 'parametres'}
                onClick={() => onTabChange('parametres')}
                icon={<Settings className="h-4 w-4" aria-hidden="true" />}
                label="Paramètres"
              />
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      <footer className="mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
          <div className="voltrix-divider mb-4" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-zinc-500">
            <p>
              VOLTRIX — application 100 % frontend : données ESPN appelées directement par votre
              navigateur. Aucune cote, aucun conseil de paris.
            </p>
            <p>Les statistiques manquantes sont affichées « Non disponible », jamais estimées.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-xl px-3.5 h-10 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
        active
          ? 'glass-strong text-violet-200'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
