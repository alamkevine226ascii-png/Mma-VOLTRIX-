'use client'

/**
 * VOLTRIX — Vue Paramètres (100 % frontend) : sources de données ESPN,
 * cache local du navigateur, documentation du moteur de pronostics,
 * vérification publique du modèle (exécutée en direct dans le navigateur).
 */
import { useState } from 'react'
import {
  CheckCircle2,
  Database,
  Globe2,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useAsyncData, formatDateTimeFr } from '@/components/voltrix/api'
import { clearCache, getCacheStats } from '@/lib/espn'
import { runModelCheck } from '@/lib/mma/loaders'
import type { ModelCheckResult } from '@/lib/mma/loaders'
import { DIMENSION_WEIGHTS, MODEL_VERSION, P_MIN, P_MAX } from '@/lib/mma/prediction'
import { cn } from '@/lib/utils'

export function SettingsView() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Paramètres</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Sources de données, cache du navigateur et transparence du modèle — application
          100 % frontend, sans serveur ni base de données.
        </p>
      </div>

      <ArchitectureSection />
      <CacheSection />
      <ModelSection />
      <ModelCheckSection />

      <section className="glass-soft rounded-2xl p-5" aria-labelledby="ethics-title">
        <h3 id="ethics-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          Engagements de données
        </h3>
        <ul className="space-y-1.5 text-xs text-zinc-400">
          <li>· Aucune donnée fabriquée : une valeur absente reste « Non disponible ».</li>
          <li>· Toutes les données proviennent des endpoints publics ESPN, appelés par votre navigateur.</li>
          <li>· Les indicateurs calculés (fenêtre 8 combats) sont explicitement étiquetés.</li>
          <li>· Pronostics fondés uniquement sur des dimensions observées, pondérations publiques, probabilités bornées {P_MIN}-{P_MAX} %.</li>
          <li>· Pas de pronostic sans données suffisantes — refus explicite plutôt qu&apos;extrapolation.</li>
          <li>· Pronostics informatifs : VOLTRIX n&apos;édite aucune cote et ne donne aucun conseil de paris.</li>
        </ul>
      </section>
    </div>
  )
}

/** Section architecture : rappel frontend pur + endpoints utilisés. */
function ArchitectureSection() {
  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="sources-title">
      <h3 id="sources-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
        <Globe2 className="h-4 w-4 text-violet-300" aria-hidden="true" />
        Sources de données
      </h3>
      <div className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3 bg-white/[0.03] border border-white/5">
          <div>
            <p className="text-zinc-200 font-medium">ESPN MMA (accès direct navigateur)</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              site.api.espn.com · sports.core.api.espn.com · site.web.api.espn.com — endpoints publics
              (CORS ouvert), aucune clé, aucun serveur intermédiaire. UFC et PFL actifs, Bellator en
              historique.
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
              Modèle {MODEL_VERSION} exécuté dans votre navigateur · agrégation pondérée de 11 dimensions
              statistiques, probabilités bornées {P_MIN}-{P_MAX} %, vérification publique sur les combats
              terminés
            </p>
          </div>
          <span className="text-[10px] text-violet-200 bg-violet-400/10 border border-violet-300/25 px-2 py-1 rounded-md shrink-0">
            ACTIF
          </span>
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
        Note : les endpoints ESPN sont publics et sans clé, mais non documentés officiellement ; les
        conditions d&apos;utilisation Disney/ESPN réservent l&apos;usage commercial à une licence. VOLTRIX
        les utilise dans un cadre personnel et non commercial, depuis votre navigateur, avec mise en
        cache locale et limitation de concurrence.
      </p>
    </section>
  )
}

/** Section cache local : statistiques et vidage. */
function CacheSection() {
  const { data, reload } = useAsyncData<ReturnType<typeof getCacheStats>>(() =>
    Promise.resolve(getCacheStats())
  )
  const [clearing, setClearing] = useState(false)

  const clear = async () => {
    setClearing(true)
    try {
      clearCache()
      await reload()
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="cache-title">
      <h3 id="cache-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
        <Database className="h-4 w-4 text-violet-300" aria-hidden="true" />
        Cache local du navigateur
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <Stat label="Entrées en cache" value={data?.entries} />
        <Stat label="Taille approx." value={data ? `${data.approxSizeKb} Ko` : undefined} />
        <Stat
          label="Hôtes"
          value={data ? data.providers.filter((p) => p.count > 0).length : undefined}
        />
        <Stat label="Durée de vie" value="10 min – 24 h" />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 max-w-xl leading-relaxed">
          Les réponses ESPN sont conservées en mémoire et en sessionStorage (aucune donnée ne quitte
          votre navigateur). Les indicateurs avancés calculés sont conservés 12 h. Vider le cache
          force des requêtes fraîches au prochain affichage.
        </p>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={clearing}
          className="glass-strong glass-hover rounded-xl px-4 h-10 text-sm font-medium text-rose-200 inline-flex items-center gap-2 disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <Trash2 className={cn('h-4 w-4', clearing && 'animate-pulse')} aria-hidden="true" />
          {clearing ? 'Suppression…' : 'Vider le cache'}
        </button>
      </div>
    </section>
  )
}

/** Section documentation du modèle : pondérations publiques. */
function ModelSection() {
  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="model-title">
      <h3 id="model-title" className="font-semibold text-zinc-100 flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-violet-300" aria-hidden="true" />
        Modèle de pronostics — pondérations publiques
      </h3>
      <div className="overflow-x-auto voltrix-scroll">
        <table className="w-full text-xs min-w-[380px]">
          <thead>
            <tr className="text-zinc-500 text-left border-b border-white/8">
              <th className="py-2 pr-3 font-medium">Dimension</th>
              <th className="py-2 font-medium">Poids</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(DIMENSION_WEIGHTS).map(([key, w]) => (
              <tr key={key} className="border-b border-white/5">
                <td className="py-2 pr-3 text-zinc-300">{DIMENSION_LABELS[key] ?? key}</td>
                <td className="py-2 text-zinc-500 font-mono">×{w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
        Pipeline : indices relatifs 0-100 par dimension → agrégation pondérée → transformation
        logistique → bornage [{P_MIN} % ; {P_MAX} %]. Combat trop serré → « indécis » sans favori.
        Moins de 3 dimensions comparables → refus explicite du pronostic.
      </p>
    </section>
  )
}

const DIMENSION_LABELS: Record<string, string> = {
  forme: 'Forme récente (5 combats)',
  volume: 'Volume de frappes',
  precision: 'Précision des frappes',
  absorption: 'Frappes absorbées',
  'defense-frappes': 'Défense contre les frappes',
  lutte: 'Lutte (takedowns)',
  'defense-takedown': 'Défense contre les takedowns',
  sol: 'Soumissions',
  puissance: 'Pouvoir de finition',
  experience: 'Expérience',
  physique: 'Envergure physique',
}

/** Section vérification du modèle : backtest navigateur à la demande. */
function ModelCheckSection() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ModelCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const r = await runModelCheck((done, total) => setProgress({ done, total }))
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="check-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="check-title" className="font-semibold text-zinc-100 flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Vérification du modèle (en direct)
        </h3>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed mb-4">
        Le modèle {MODEL_VERSION} est recalculé sur les combats terminés des derniers événements
        passés (données ESPN chargées dans votre navigateur) et confronté aux vainqueurs réels. Le
        résultat est publié tel quel, y compris s&apos;il est défavorable. Cette vérification lance
        plusieurs dizaines de requêtes ESPN — comptez quelques dizaines de secondes.
      </p>

      {!result && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="glass-strong glass-hover rounded-xl px-4 h-10 text-sm font-medium text-violet-200 inline-flex items-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <RefreshCw className={cn('h-4 w-4', running && 'animate-spin')} aria-hidden="true" />
          {running
            ? `Vérification…${progress ? ` ${progress.done}/${progress.total}` : ''}`
            : 'Lancer la vérification'}
        </button>
      )}

      {error && (
        <p className="text-sm text-amber-200/90 mt-3" role="alert">
          Vérification interrompue : {error}. Les fiches déjà chargées restent en cache — relancez
          dans un instant.
        </p>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <Stat label="Combats testés" value={result.analyzed} />
            <Stat label="Favoris confirmés" value={result.correct} />
            <Stat label="Taux de réussite" value={result.accuracyPct != null ? `${result.accuracyPct} %` : undefined} />
            <Stat label="Non départagés" value={result.skipped} />
          </div>
          {result.rows.length > 0 && (
            <ul className="space-y-2 max-h-72 overflow-y-auto voltrix-scroll pr-1 mb-3">
              {result.rows.map((f, i) => (
                <li
                  key={i}
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
          <ul className="mt-2 space-y-1">
            {result.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-zinc-600 leading-relaxed">
                · {n}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="mt-4 text-xs text-violet-300 hover:text-violet-200 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg px-2 py-1 -ml-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', running && 'animate-spin')} aria-hidden="true" />
            Relancer la vérification
          </button>
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
