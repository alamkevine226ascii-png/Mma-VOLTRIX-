'use client'

/**
 * VOLTRIX — Page principale (route unique).
 * Architecture conservée : onglets Accueil / Paramètres.
 * L'Accueil est intégralement dédié au MMA : événements, combats,
 * statistiques sourcées et pronostics.
 */
import { useState } from 'react'
import { AppShell, type MainTab } from '@/components/voltrix/AppShell'
import { SettingsView } from '@/components/voltrix/SettingsView'
import { MmaView } from '@/components/mma/MmaView'

export default function Home() {
  const [tab, setTab] = useState<MainTab>('accueil')

  return (
    <AppShell tab={tab} onTabChange={setTab}>
      {tab === 'parametres' ? <SettingsView /> : <MmaView />}
    </AppShell>
  )
}
