'use client'

/**
 * VOLTRIX — Vue Paramètres : sources de données, synchronisation,
 * fiabilité du moteur de pronostics, journaux, informations légales.
 */
import { useState } from 'react'
import { CheckCircle2, Database, Globe2, RefreshCw, ScrollText, ShieldCheck, Sparkles, Target, XCircle } from 'lucide-react'
import { useApi, formatDateTimeFr } from '@/components/voltrix/api'
import { BacktestSummary } from '@/components/mma/types'
import { cn } from '@/lib/utils'

interface SyncLogEntry {
  id: string
  job: string
  status: string
  itemsFetched: number
  itemsCreated: number
  itemsUpdated: number
  errors: unknown[]
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
}

interface SyncStatusResponse {
  lastEventsSyncAt: string | null
  scheduler: {
    startedAt: string
    eventsIntervalMs: number
    enrichIntervalMs: number
    runs: { job: string; at: string; status: string; durationMs: number }[]
  }
  counts: {
    events: number
    fights: number
    fighters: number
    fighterStats: number
    history: number
  }
  logs: SyncLogEntry[]
}

const JOB_LABELS: Record<string, string> = {
  events: 'Événements & combats',
  'event-details': 'Détails des combats',
}

export function SettingsView() {
  const { data, reload } = useApi<SyncStatusResponse>('/api/mma/sync')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const runSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/mma/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxEvents: 2, maxFighters: 20 }),
      })
      const body = (await res.json()) as {
        events?: { status: string; itemsFetched: number; errors: unknown[] }
        fightersEnriched?: number
      }
      if (body.events) {
        setSyncMessage(
          `Synchronisation ${body.events.status === 'SUCCESS' ? 'réussie' : 'partielle'} : ${body.events.itemsFetched} événements récupérés, ${body.fightersEnriched ?? 0} fiches enrichies${body.events.errors.length ? `, ${body.events.errors.length} erreur(s)` : ''}.`
        )
      }
      await reload()
    } catch {
      setSyncMessage('Échec de la synchronisation.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Paramètres</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Sources de données, synchronisation et traçabilité des modules.
        </p>
      </div>

      {/* Sources de données */}
      <section className="glass rounded-2xl p-5" aria-labelledby="sources-title">
        <h3 id="sources-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
          <Globe2 className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Sources de données
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3 bg-white/[0.03] border border-white/5">
            <div>
              <p className="text-zinc-200 font-medium">Module MMA</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                ESPN MMA · UFC, PFL (actifs), Bellator (historique) · endpoints vérifiés le 08/11/2026 ·
                événements, combats, combattants, statistiques de carrière
              </p>
            </div>
            <span className="text-[10px] text-emerald-200 bg-emerald-400/10 border border-emerald-300/25 px-2 py-1 rounded-md shrink-0">
              ACTIF
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3 bg-white/[0.03] border border-white/5">
            <div>
              <p className="text-zinc-200 font-medium">Moteur de pronostics</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Modèle voltrix-mma-v1 · agrégation pondérée de 11 dimensions statistiques, probabilités
                bornées 25-75 %, fiabilité mesurée par backtest sur les combats terminés
              </p>
            </div>
            <span className="text-[10px] text-violet-200 bg-violet-400/10 border border-violet-300/25 px-2 py-1 rounded-md shrink-0">
              ACTIF
            </span>
          </div>
        </div>
        <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
          Note : les endpoints ESPN sont publics et sans clé, mais non documentés officiellement ;
          les conditions d&apos;utilisation Disney/ESPN réservent l&apos;usage commercial à une licence
          (ex. Sportradar). VOLTRIX les utilise dans un cadre personnel et non commercial, avec un
          adaptateur fournisseur interchangeable si une source sous licence devenait nécessaire.
        </p>
      </section>

      {/* Synchronisation */}
      <section className="glass rounded-2xl p-5" aria-labelledby="sync-title">
        <h3 id="sync-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Synchronisation
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
          <Stat label="Événements" value={data?.counts.events} />
          <Stat label="Combats" value={data?.counts.fights} />
          <Stat label="Combattants" value={data?.counts.fighters} />
          <Stat label="Fiches stats" value={data?.counts.fighterStats} />
          <Stat label="Historique" value={data?.counts.history} />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Dernière synchro événements :{' '}
            {data?.lastEventsSyncAt ? formatDateTimeFr(data.lastEventsSyncAt) : 'jamais'} UTC
            <br />
            Ordonnanceur automatique : événements toutes les 30 min, enrichissement toutes les 6 h.
          </p>
          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="glass-strong glass-hover rounded-xl px-4 h-10 text-sm font-medium text-violet-200 inline-flex items-center gap-2 disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} aria-hidden="true" />
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </button>
        </div>
        {syncMessage && (
          <p className="text-xs text-zinc-300 mt-3 rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2" role="status">
            {syncMessage}
          </p>
        )}
      </section>

      {/* Fiabilité des pronostics */}
      <PredictionReliabilitySection />

      {/* Journaux */}
      <section className="glass rounded-2xl p-5" aria-labelledby="logs-title">
        <h3 id="logs-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
          <ScrollText className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Journaux de synchronisation
        </h3>
        {data && data.logs.length > 0 ? (
          <ul className="space-y-2 max-h-80 overflow-y-auto voltrix-scroll pr-1">
            {data.logs.map((l) => (
              <li
                key={l.id}
                className="flex items-start gap-3 rounded-xl px-3.5 py-2.5 bg-white/[0.03] border border-white/5 text-sm"
              >
                {l.status === 'SUCCESS' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5 shrink-0" aria-hidden="true" />
                ) : l.status === 'PARTIAL' ? (
                  <ShieldCheck className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" aria-hidden="true" />
                ) : l.status === 'RUNNING' ? (
                  <RefreshCw className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0 voltrix-pulse" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 font-medium">
                    {JOB_LABELS[l.job] ?? l.job}
                    <span className="text-zinc-500 font-normal"> · {l.status}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {formatDateTimeFr(l.startedAt)} UTC · {l.itemsFetched} récupérés · {l.itemsCreated} créés ·{' '}
                    {l.itemsUpdated} mis à jour
                    {l.durationMs != null ? ` · ${(l.durationMs / 1000).toFixed(1)}s` : ''}
                    {l.errors.length ? ` · ${l.errors.length} erreur(s)` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Aucun journal pour le moment.</p>
        )}
      </section>

      <section className="glass-soft rounded-2xl p-5" aria-labelledby="ethics-title">
        <h3 id="ethics-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          Engagements de données
        </h3>
        <ul className="space-y-1.5 text-xs text-zinc-400">
          <li>· Aucune donnée fabriquée : une valeur absente reste « Non disponible ».</li>
          <li>· Chaque statistique porte sa source et sa date de synchronisation.</li>
          <li>· Les indicateurs calculés (fenêtre 10 combats) sont explicitement étiquetés.</li>
          <li>· Pronostics fondés uniquement sur des dimensions observées, pondérations publiques, probabilités bornées 25-75 %.</li>
          <li>· Pas de pronostic sans données suffisantes — refus explicite plutôt qu&apos;extrapolation.</li>
          <li>· Pronostics informatifs : VOLTRIX n&apos;édite aucune cote et ne donne aucun conseil de paris.</li>
        </ul>
      </section>
    </div>
  )
}

/** Section fiabilité : backtest public du moteur de pronostics. */
function PredictionReliabilitySection() {
  const { data, loading, error, reload } = useApi<BacktestSummary>('/api/mma/predictions')
  const [showFights, setShowFights] = useState(false)

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="pronostic-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="pronostic-title" className="font-semibold text-zinc-100 flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Fiabilité du moteur de pronostics
        </h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="text-xs text-zinc-400 hover:text-violet-300 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg px-2 py-1"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
          Recalculer
        </button>
      </div>

      {loading && !data && <div className="glass-soft rounded-xl h-24 voltrix-pulse" aria-hidden="true" />}

      {error && (
        <p className="text-sm text-amber-200/90">
          Backtest momentanément indisponible : {error}. Les pronostics par combat restent calculés en temps réel.
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <Stat label="Combats testés" value={data.analyzed} />
            <Stat label="Favoris confirmés" value={data.correct} />
            <Stat label="Taux de réussite" value={data.accuracyPct != null ? `${data.accuracyPct} %` : undefined} />
            <Stat label="Combats serrés exclus" value={data.skippedTooClose + data.skippedInsufficientData} />
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">
            Le modèle {data.model} est recalculé sur les combats terminés présents en base (données ESPN
            synchronisées) et confronté aux vainqueurs réels. Le résultat est publié tel quel, y compris
            s&apos;il est défavorable. Ventilation par fiabilité des données :{' '}
            {data.byConfidence
              .map((c) => `${c.label.toLowerCase()} ${c.correct}/${c.analyzed}`)
              .join(' · ')}
            .
          </p>
          {data.fights.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowFights((v) => !v)}
                aria-expanded={showFights}
                className="text-xs text-violet-300 hover:text-violet-200 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg px-2 py-1 -ml-2"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {showFights ? 'Masquer' : 'Voir'} les derniers combats testés
              </button>
              {showFights && (
                <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto voltrix-scroll pr-1">
                  {data.fights.map((f) => (
                    <li
                      key={f.fightId}
                      className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 bg-white/[0.03] border border-white/5 text-sm"
                    >
                      {f.correct ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300 mt-0.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-zinc-200">
                          {f.fighterA} <span className="text-zinc-500">vs.</span> {f.fighterB}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Favori : {f.predictedFavorite} ({f.probability} %) · Vainqueur réel : {f.actualWinner}
                          {f.eventName ? ` · ${f.eventName}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <ul className="mt-3 space-y-1">
            {data.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-zinc-600 leading-relaxed">
                · {n}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
      <p className="text-lg font-bold text-zinc-100 tabular-nums">{value ?? '—'}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  )
}
