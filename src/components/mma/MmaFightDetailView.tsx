'use client'

/**
 * MODULE MMA — Vue Combat : présentation, comparaison statistique,
 * historique, analyse des styles, sources.
 * Séparation stricte : « Données observées » vs « Interprétation statistique ».
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Flag,
  Info,
  MapPin,
  Ruler,
  ScanEye,
  ShieldAlert,
  Sparkles,
  Swords,
  Timer,
  Users,
  XCircle,
} from 'lucide-react'
import { useAsyncData, formatDateFr } from '@/components/voltrix/api'
import { BackButton } from '@/components/mma/MmaEventDetailView'
import { loadFightAnalysis } from '@/lib/mma/loaders'
import type { FightContext } from '@/lib/mma/loaders'
import {
  FighterView,
  FightAnalysis,
  ORG_STYLES,
  RESULT_LABELS,
  STATUS_CLASSES,
  STATUS_LABELS,
} from '@/components/mma/types'
import { cn } from '@/lib/utils'

interface MmaFightDetailProps {
  ctx: FightContext
  onBack: () => void
}

type DetailTab = 'pronostic' | 'comparaison' | 'historique' | 'styles' | 'sources'

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
  { key: 'pronostic', label: 'Pronostic', icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
  { key: 'comparaison', label: 'Comparaison', icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
  { key: 'historique', label: 'Historique', icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
  { key: 'styles', label: 'Styles', icon: <Swords className="h-4 w-4" aria-hidden="true" /> },
  { key: 'sources', label: 'Sources', icon: <ScanEye className="h-4 w-4" aria-hidden="true" /> },
]

const COLOR_A = '#a78bfa'
const COLOR_B = '#fb7185'

/**
 * Mesure explicite du conteneur (ResizeObserver + ref callback) pour
 * dimensionner les graphiques recharts sans ResponsiveContainer, dont la
 * mesure initiale peut être faussée dans une grille fractionnaire.
 */
function useContainerSize<T extends HTMLElement>() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [element, setElement] = useState<T | null>(null)

  const setEl = useCallback((node: T | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(element)
    return () => ro.disconnect()
  }, [element])

  return { setEl, size }
}

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(10,10,18,0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  fontSize: 12,
} as const

export function MmaFightDetailView({ ctx, onBack }: MmaFightDetailProps) {
  const [tab, setTab] = useState<DetailTab>('pronostic')
  const { data, loading, error, reload } = useAsyncData<FightAnalysis>(() => loadFightAnalysis(ctx), { key: ctx.espnCompetitionId })
  const pending = data?.derivedPending === true

  // Recharge tant que les indicateurs dérivés sont en cours de calcul
  // dans le navigateur (cache sessionStorage à la clé).
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => void reload(), 6000)
    return () => clearInterval(t)
  }, [pending, reload])

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="glass-soft rounded-2xl h-40 voltrix-pulse" />
        <div className="glass-soft rounded-2xl h-64 voltrix-pulse" />
      </div>
    )
  }

  if (error || !data || 'error' in (data as object)) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} label="Événement" />
        <p className="glass rounded-xl p-4 text-sm text-red-200" role="alert">
          {error ?? 'Combat introuvable'}
        </p>
      </div>
    )
  }

  const a = data.fighters[0]
  const b = data.fighters[1]
  const org = ORG_STYLES[data.event.organization] ?? {
    label: data.event.organization,
    badge: 'text-zinc-200 bg-white/10 border-white/20',
  }

  return (
    <section aria-label="Analyse du combat" className="space-y-5">
      <BackButton onBack={onBack} label="Événement" />

      {/* En-tête : événement + combat */}
      <header className="glass rounded-2xl p-5 sm:p-6 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/40 to-transparent"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', org.badge)}>
            {org.label}
          </span>
          <span
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-md border',
              STATUS_CLASSES[data.fight.status] ?? 'text-zinc-300 bg-white/5 border-white/15'
            )}
          >
            {STATUS_LABELS[data.fight.status] ?? data.fight.status}
          </span>
          {data.fight.weightClass && (
            <span className="text-[11px] text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
              {data.fight.weightClass}
            </span>
          )}
          {data.fight.scheduledRounds && (
            <span className="text-[11px] text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
              {data.fight.scheduledRounds} rounds
            </span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-50 leading-tight">
          {a.fullName} <span className="text-zinc-500 font-medium">vs.</span> {b.fullName}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">{data.event.name}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateFr(data.event.date, { weekday: 'long', year: 'numeric' })}
          </span>
          {data.event.venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {data.event.venue}
              {data.event.city ? `, ${data.event.city}` : ''}
            </span>
          )}
        </div>
        {data.fight.status === 'TERMINE' && data.fight.resultDetail && (
          <p className="mt-3 text-sm text-emerald-200/90 inline-flex items-center gap-2">
            <Swords className="h-4 w-4" aria-hidden="true" />
            {data.fight.resultDetail}
          </p>
        )}
      </header>

      {/* Cartes combattants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FighterCard fighter={a} accent={COLOR_A} />
        <FighterCard fighter={b} accent={COLOR_B} />
      </div>

      {data.derivedPending && (
        <p className="glass-soft rounded-xl px-4 py-3 text-xs text-amber-200/90 voltrix-pulse inline-flex items-center gap-2 w-full">
          <Timer className="h-4 w-4" aria-hidden="true" />
          Calcul des indicateurs avancés en cours (frappes reçues/minute, défenses, temps moyen) —
          actualisez la page dans un instant.
        </p>
      )}

      {/* Onglets de détail */}
      <div className="flex glass-soft rounded-xl p-1 gap-1 overflow-x-auto voltrix-scroll" role="tablist" aria-label="Sections du combat">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 h-9 text-sm font-medium whitespace-nowrap transition-all',
              tab === t.key ? 'glass-strong text-violet-200' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pronostic' && <PredictionTab data={data} />}
      {tab === 'comparaison' && <ComparisonTab data={data} />}
      {tab === 'historique' && <HistoryTab data={data} />}
      {tab === 'styles' && <StylesTab data={data} />}
      {tab === 'sources' && <SourcesTab data={data} />}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Onglet Pronostic
// ---------------------------------------------------------------------------

const CONFIDENCE_STYLES: Record<string, string> = {
  Bonne: 'text-emerald-200 bg-emerald-400/10 border-emerald-300/25',
  Moyenne: 'text-amber-200 bg-amber-400/10 border-amber-300/25',
  Limitée: 'text-orange-200 bg-orange-400/10 border-orange-300/25',
}

function PredictionTab({ data }: { data: FightAnalysis }) {
  const p = data.prediction
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const a = data.fighters[0]
  const b = data.fighters[1]

  // Confrontation rétrospective pour un combat terminé
  const retrospective =
    data.fight.status === 'TERMINE' && p.available
      ? {
          fought: data.fight.winner != null,
          correct: p.favoriteExternalId != null && p.favoriteExternalId === data.fight.winner,
        }
      : null

  if (!p.available) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl p-6 text-center" role="status">
          <AlertTriangle className="h-8 w-8 text-amber-300 mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-bold text-zinc-100">Pronostic non disponible</h3>
          <p className="text-sm text-zinc-400 mt-2 max-w-xl mx-auto">{p.unavailabilityReason}</p>
          <p className="text-xs text-zinc-500 mt-3 max-w-xl mx-auto">
            VOLTRIX ne pronostique jamais sans données observées suffisantes. Les fiches des combattants
            peuvent encore être en cours de synchronisation — actualisez dans un instant.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Encadré rétrospectif pour un combat terminé */}
      {retrospective && (
        <div
          className={cn(
            'glass rounded-2xl px-4 py-3 text-sm flex items-start gap-3',
            retrospective.fought
              ? retrospective.correct
                ? 'text-emerald-200'
                : 'text-red-200'
              : 'text-zinc-300'
          )}
          role="status"
        >
          {retrospective.fought ? (
            retrospective.correct ? (
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
            )
          ) : (
            <Info className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p>
            {retrospective.fought ? (
              <>
                Combat terminé — <strong>vérification rétrospective</strong> : le modèle donnait{' '}
                {p.favoriteName} favori à {Math.max(p.probabilityA ?? 0, p.probabilityB ?? 0)} %.{' '}
                {retrospective.correct
                  ? 'Le favori du modèle a bien gagné.'
                  : `Le vainqueur réel (${data.fighters.find((f) => f.externalId === data.fight.winner)?.fullName ?? 'adversaire'}) a créé la surprise.`}
              </>
            ) : (
              <>
                Combat terminé — vainqueur non identifié dans les données synchronisées ; vérification
                rétrospective impossible.
              </>
            )}
          </p>
        </div>
      )}

      {/* Carte principale du pronostic */}
      <article className="glass rounded-2xl p-5 sm:p-6 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/40 to-transparent"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <h3 className="font-bold text-zinc-100 inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Pronostic VOLTRIX
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {p.confidence && (
              <span
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-md border',
                  CONFIDENCE_STYLES[p.confidence.label] ?? 'text-zinc-300 bg-white/5 border-white/15'
                )}
                title={`Fiabilité des données : ${p.confidence.score}/100`}
              >
                Fiabilité {p.confidence.label.toLowerCase()} · {p.confidence.dimensionsUsed}/
                {p.confidence.dimensionsTotal} dimensions
              </span>
            )}
            <span className="text-[10px] text-zinc-500 font-mono">{p.model.version}</span>
          </div>
        </div>

        {p.favorite == null ? (
          <p className="text-sm text-zinc-300 text-center py-6">
            Rencontre <strong>statistiquement trop serrée</strong> pour désigner un favori
            ({p.probabilityA} % – {p.probabilityB} %). Aucun avis ne serait honnête sur cet écart.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start sm:items-center gap-3 sm:gap-6">
              <ProbabilitySide
                name={a.fullName}
                probability={p.probabilityA}
                isFavorite={p.favorite === 'A'}
                color={COLOR_A}
                align="left"
              />
              <div className="text-center pt-8 sm:pt-10">
                <span className="text-[10px] font-bold text-zinc-600 tracking-widest" aria-hidden="true">
                  VS
                </span>
                <p className="text-[11px] text-zinc-500 mt-1 capitalize">{p.marginLabel}</p>
              </div>
              <ProbabilitySide
                name={b.fullName}
                probability={p.probabilityB}
                isFavorite={p.favorite === 'B'}
                color={COLOR_B}
                align="right"
              />
            </div>
            <p className="text-center text-sm text-zinc-300 mt-5">
              Favori du modèle :{' '}
              <strong className="text-zinc-50">{p.favoriteName}</strong>{' '}
              <span className="text-zinc-500">
                ({Math.max(p.probabilityA ?? 0, p.probabilityB ?? 0)} % de chances estimées)
              </span>
            </p>
          </>
        )}

        {/* Probabilités présentées comme estimation, jamais certitude */}
        <p className="text-[11px] text-zinc-500 text-center mt-2">
          Probabilité estimée par agrégation pondérée des statistiques observées — bornée entre 25 % et 75 %,
          ce n&apos;est ni une certitude ni une cote.
        </p>
      </article>

      {/* Méthode de victoire la plus probable */}
      {p.method && (
        <article className="glass rounded-2xl p-5">
          <h3 className="font-semibold text-zinc-100 inline-flex items-center gap-2 mb-2.5 text-sm">
            <Crosshair className="h-4 w-4 text-rose-300" aria-hidden="true" />
            Issue la plus probable chez le favori
          </h3>
          <p className="text-sm text-zinc-300">
            {p.method.label}
            {p.method.share != null && (
              <span className="text-zinc-500"> — {p.method.share} % de ses victoires</span>
            )}
          </p>
          <p className="text-xs text-zinc-500 mt-1.5">{p.method.detail}</p>
        </article>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Facteurs clés */}
        {p.keyFactors.length > 0 && (
          <article className="glass rounded-2xl p-5">
            <h3 className="font-semibold text-zinc-100 inline-flex items-center gap-2 mb-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Pourquoi {p.favoriteName ?? 'ce favori'}
            </h3>
            <ul className="space-y-3">
              {p.keyFactors.map((f, i) => (
                <li key={i} className="text-sm">
                  <p className="text-zinc-200 font-medium">{f.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{f.text}</p>
                </li>
              ))}
            </ul>
          </article>
        )}

        {/* Points de vigilance */}
        {p.watchOuts.length > 0 && (
          <article className="glass rounded-2xl p-5">
            <h3 className="font-semibold text-zinc-100 inline-flex items-center gap-2 mb-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
              Points de vigilance
            </h3>
            <ul className="space-y-3">
              {p.watchOuts.map((f, i) => (
                <li key={i} className="text-sm">
                  <p className="text-zinc-200 font-medium">{f.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{f.text}</p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-zinc-600 mt-3">
              Un combat ne se réduit pas à ses statistiques : scénarios de blessure, enjeux de titre et
              dynamique du soir restent hors de portée du modèle.
            </p>
          </article>
        )}
      </div>

      {/* Méthodologie dépliable */}
      <article className="glass-soft rounded-2xl">
        <button
          type="button"
          onClick={() => setMethodologyOpen((v) => !v)}
          aria-expanded={methodologyOpen}
          className="w-full flex items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-2xl"
        >
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Comment ce pronostic est calculé
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-zinc-500 transition-transform', methodologyOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {methodologyOpen && (
          <div className="px-5 pb-5 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Chaque dimension comparative (source : stats de carrière ESPN et indicateurs calculés sur les
              10 derniers combats) produit un indice relatif 0-100 pour chaque combattant. Le modèle agrège
              ces indices avec les poids ci-dessous, transforme l&apos;avantage en probabilité (fonction
              logistique) puis la borne entre 25 % et 75 %.
            </p>
            <div className="overflow-x-auto voltrix-scroll">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="text-zinc-500 text-left border-b border-white/8">
                    <th className="py-2 pr-3 font-medium">Dimension</th>
                    <th className="py-2 pr-3 font-medium">Poids</th>
                    <th className="py-2 pr-3 font-medium">{a.fullName.split(' ').slice(-1)[0]}</th>
                    <th className="py-2 pr-3 font-medium">{b.fullName.split(' ').slice(-1)[0]}</th>
                    <th className="py-2 font-medium">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {p.model.factors.map((f) => (
                    <tr key={f.key} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-zinc-300">{f.label}</td>
                      <td className="py-2 pr-3 text-zinc-500 font-mono">×{f.weight}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: COLOR_A }}>
                        {Math.round(f.scoreA)}
                      </td>
                      <td className="py-2 pr-3 font-mono" style={{ color: COLOR_B }}>
                        {Math.round(f.scoreB)}
                      </td>
                      <td
                        className={cn(
                          'py-2 font-mono',
                          f.edge > 0 ? 'text-violet-300' : f.edge < 0 ? 'text-rose-300' : 'text-zinc-500'
                        )}
                      >
                        {f.edge > 0 ? '+' : ''}
                        {Math.round(f.edge)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-1.5">
              {p.model.notes.map((n, i) => (
                <li key={i} className="text-[11px] text-zinc-500 leading-relaxed">
                  · {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  )
}

function ProbabilitySide({
  name,
  probability,
  isFavorite,
  color,
  align,
}: {
  name: string
  probability: number | null
  isFavorite: boolean
  color: string
  align: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p
        className={cn(
          'font-semibold text-sm sm:text-base truncate',
          isFavorite ? 'text-zinc-50' : 'text-zinc-400'
        )}
      >
        {name}
      </p>
      <p className="text-3xl sm:text-4xl font-black tabular-nums mt-1.5" style={{ color }}>
        {probability != null ? `${probability} %` : '—'}
      </p>
      <div className="h-1.5 rounded-full bg-white/8 mt-2 overflow-hidden" aria-hidden="true">
        <div
          className={cn('h-full rounded-full transition-all', align === 'right' && 'ml-auto')}
          style={{ width: `${probability ?? 0}%`, background: color }}
        />
      </div>
      {isFavorite && (
        <p className="text-[10px] text-emerald-300 mt-1.5 font-semibold tracking-wide uppercase">
          Favori
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte combattant
// ---------------------------------------------------------------------------

function FighterCard({ fighter, accent }: { fighter: FighterView; accent: string }) {
  const rec = fighter.record
  return (
    <article className="glass rounded-2xl p-5 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}66, transparent 70%)` }}
        aria-hidden="true"
      />
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {fighter.imageUrl ? (
            <img
              src={fighter.imageUrl}
              alt={`Photo de ${fighter.fullName}`}
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-cover border border-white/10 bg-white/5"
              loading="lazy"
            />
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-zinc-600" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-zinc-50 leading-tight">{fighter.fullName}</h3>
            {fighter.flagUrl && (
              <img
                src={fighter.flagUrl}
                alt={fighter.nationality ?? 'nationalité'}
                className="h-3.5 w-5 rounded-sm border border-white/10 object-cover"
                loading="lazy"
              />
            )}
          </div>
          {fighter.nickname && <p className="text-sm text-zinc-500 italic">« {fighter.nickname} »</p>}
          <p className="mt-1.5 font-mono text-base" style={{ color: accent }}>
            {rec.wins != null
              ? `${rec.wins}-${rec.losses ?? '?'}-${rec.draws ?? '?'}`
              : 'Palmarès non disponible'}
            {rec.noContests ? ` (${rec.noContests} NC)` : ''}
          </p>
          {fighter.lastResults.length > 0 && (
            <div className="flex items-center gap-1 mt-2" aria-label="Cinq derniers résultats">
              {fighter.lastResults.slice(0, 5).map((r, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border',
                    r === 'W'
                      ? 'bg-emerald-400/20 text-emerald-300 border-emerald-300/20'
                      : r === 'L'
                        ? 'bg-red-400/20 text-red-300 border-red-300/20'
                        : 'bg-zinc-400/20 text-zinc-300 border-zinc-300/20'
                  )}
                >
                  {RESULT_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
        <Attr label="Âge" value={fighter.age != null ? `${fighter.age} ans` : 'n/d'} icon={<Timer className="h-3.5 w-3.5" aria-hidden="true" />} />
        <Attr label="Taille" value={fighter.heightCm != null ? `${fighter.heightCm} cm` : 'n/d'} icon={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />} />
        <Attr label="Allonge" value={fighter.reachCm != null ? `${fighter.reachCm} cm` : 'n/d'} icon={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />} />
        <Attr label="Garde" value={fighter.stance ?? 'n/d'} icon={<Swords className="h-3.5 w-3.5" aria-hidden="true" />} />
        <Attr label="Nationalité" value={fighter.nationality ?? 'n/d'} icon={<Flag className="h-3.5 w-3.5" aria-hidden="true" />} />
        <Attr label="Catégorie" value={fighter.weightClass ?? 'n/d'} icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />} />
      </dl>
    </article>
  )
}

function Attr({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-zinc-600 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] text-zinc-500">{label}</dt>
        <dd className="text-zinc-200 font-medium truncate">{value}</dd>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet Comparaison
// ---------------------------------------------------------------------------

function ComparisonTab({ data }: { data: FightAnalysis }) {
  const a = data.fighters[0]
  const b = data.fighters[1]
  const dimBars = data.dimensions
    .filter((d) => d.available)
    .map((d) => ({
      label: d.label,
      A: d.scoreA ?? 0,
      B: d.scoreB ?? 0,
    }))
  const {
    setEl: setRadarEl,
    size: radarSize,
  } = useContainerSize<HTMLDivElement>()
  const {
    setEl: setBarsEl,
    size: barsSize,
  } = useContainerSize<HTMLDivElement>()

  return (
    <div className="space-y-5">
      {/* Données observées */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 pb-3">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
            <ScanEye className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Données observées
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Valeurs brutes telles que fournies par la source ou calculées sur une fenêtre explicite.
            « Non disponible » = donnée absente chez la source, jamais estimée.
          </p>
        </div>
        <div className="overflow-x-auto voltrix-scroll">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-y border-white/10 bg-white/[0.03]">
                <th className="text-left font-medium text-zinc-400 px-4 py-2.5 w-[27%]">{a.fullName}</th>
                <th className="text-left font-medium text-zinc-500 px-3 py-2.5 w-[24%]">Indicateur</th>
                <th className="text-left font-medium text-zinc-400 px-4 py-2.5 w-[27%]">{b.fullName}</th>
                <th className="text-left font-medium text-zinc-500 px-4 py-2.5 w-[22%] hidden md:table-cell">Origine</th>
              </tr>
            </thead>
            <tbody>
              {data.observed.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-white/5 last:border-0',
                    row.kind === 'derived' && 'bg-violet-400/[0.04]'
                  )}
                >
                  <td className={cn('px-4 py-2.5 font-medium', row.valueA === 'Non disponible' ? 'text-zinc-600 font-normal' : 'text-violet-200')}>
                    {row.valueA}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.label}</td>
                  <td className={cn('px-4 py-2.5 font-medium', row.valueB === 'Non disponible' ? 'text-zinc-600 font-normal' : 'text-rose-200')}>
                    {row.valueB}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-zinc-500 hidden md:table-cell">{row.origin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interprétation */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <h3 className="font-semibold text-zinc-100 flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-violet-300" aria-hidden="true" />
          Interprétation statistique
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          Indices relatifs (0-100) quantifiant l&apos;écart observé entre les deux combattants par
          dimension — ce ne sont ni des scores ni des probabilités.
        </p>
        <div className="grid lg:grid-cols-[5fr_7fr] gap-5">
          {data.radar.length >= 3 && (
            <div>
              <div ref={setRadarEl} className="h-72 sm:h-80 min-w-0" aria-label="Radar comparatif">
                {radarSize && radarSize.w > 60 && (
                  <RadarChart width={radarSize.w} height={radarSize.h} data={data.radar} outerRadius="68%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: '#c9c9d4', fontSize: 11 }} />
                    <Radar name={a.fullName} dataKey="A" stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.28} strokeWidth={2} />
                    <Radar name={b.fullName} dataKey="B" stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.22} strokeWidth={2} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </RadarChart>
                )}
              </div>
              <div className="flex justify-center gap-5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_A }} />
                  {a.fullName}
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_B }} />
                  {b.fullName}
                </span>
              </div>
            </div>
          )}
          <div ref={setBarsEl} className="h-72 sm:h-80 min-w-0" aria-label="Avantages par dimension">
            {barsSize && barsSize.w > 60 && (
              <BarChart
                width={barsSize.w}
                height={barsSize.h}
                data={dimBars}
                layout="vertical"
                margin={{ left: 8, right: 12 }}
                barGap={2}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  width={124}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [value, name === 'A' ? a.fullName : b.fullName]}
                />
                <Bar dataKey="A" fill={COLOR_A} radius={[0, 4, 4, 0]} barSize={9} />
                <Bar dataKey="B" fill={COLOR_B} radius={[0, 4, 4, 0]} barSize={9} />
              </BarChart>
            )}
          </div>
        </div>
      </div>

      {/* Dimensions indisponibles */}
      {data.dimensions.some((d) => !d.available) && (
        <p className="glass-soft rounded-xl px-4 py-3 text-xs text-zinc-400 inline-flex items-start gap-2 w-full">
          <ShieldAlert className="h-4 w-4 text-amber-300/80 shrink-0 mt-0.5" aria-hidden="true" />
          Dimensions non comparables faute de données chez la source :{' '}
          {data.dimensions
            .filter((d) => !d.available)
            .map((d) => d.label)
            .join(', ')}
          .
        </p>
      )}

      {/* Commentaires */}
      <div className="space-y-3">
        {data.commentary
          .filter((c) => c.title === "Lecture d'ensemble" || c.title === 'Analyse des styles')
          .map((c, i) => (
            <article key={i} className="glass-soft rounded-2xl p-4 sm:p-5">
              <h4 className="font-semibold text-zinc-100 text-sm mb-1.5">{c.title}</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">{c.text}</p>
            </article>
          ))}
        <div className="grid sm:grid-cols-2 gap-3">
          {(() => {
            const dims = data.commentary.filter(
              (c) => c.title !== "Lecture d'ensemble" && c.title !== 'Analyse des styles'
            )
            return dims.map((c, i) => (
              <article
                key={i}
                className={cn('glass-soft rounded-2xl p-4', dims.length % 2 === 1 && i === dims.length - 1 && 'sm:col-span-2')}
              >
                <h4 className="font-semibold text-zinc-100 text-[13px] mb-1">{c.title}</h4>
                <p className="text-[13px] text-zinc-500 leading-relaxed">{c.text}</p>
              </article>
            ))
          })()}
        </div>
      </div>

      {/* Limites */}
      <div className="glass rounded-2xl p-4 sm:p-5 border-amber-300/15">
        <h3 className="font-semibold text-zinc-100 flex items-center gap-2 text-sm mb-2">
          <Info className="h-4 w-4 text-amber-300" aria-hidden="true" />
          Limites de l&apos;analyse
        </h3>
        <ul className="space-y-1.5">
          {data.limitations.map((l, i) => (
            <li key={i} className="text-xs text-zinc-400 flex gap-2">
              <span className="text-amber-300/60 shrink-0" aria-hidden="true">·</span>
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet Historique
// ---------------------------------------------------------------------------

function HistoryTab({ data }: { data: FightAnalysis }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {data.fighters.map((f, idx) => (
        <div key={f.id} className="glass rounded-2xl p-4 sm:p-5">
          <h3 className="font-semibold text-zinc-100 mb-3" style={{ color: idx === 0 ? COLOR_A : COLOR_B }}>
            {f.fullName} — derniers combats
          </h3>
          {f.recentHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">Historique non disponible chez la source.</p>
          ) : (
            <ul className="space-y-1.5 max-h-96 overflow-y-auto voltrix-scroll pr-1">
              {f.recentHistory.map((h, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/[0.03] border border-white/5 text-sm"
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold shrink-0',
                      h.result === 'W'
                        ? 'bg-emerald-400/20 text-emerald-300'
                        : h.result === 'L'
                          ? 'bg-red-400/20 text-red-300'
                          : 'bg-zinc-400/20 text-zinc-300'
                    )}
                    aria-label={h.result}
                  >
                    {RESULT_LABELS[h.result] ?? h.result}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 truncate font-medium">{h.opponentName}</p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {formatDateFr(h.eventDate, { weekday: undefined, year: 'numeric' })}
                      {h.eventName ? ` · ${h.eventName}` : ''}
                    </p>
                  </div>
                  {h.titleFight && (
                    <span className="text-[9px] font-bold text-amber-300 bg-amber-400/10 border border-amber-300/25 px-1.5 py-0.5 rounded shrink-0">
                      TITRE
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet Styles
// ---------------------------------------------------------------------------

function StylesTab({ data }: { data: FightAnalysis }) {
  const styleBlock = data.commentary.find((c) => c.title === 'Analyse des styles')
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {data.fighters.map((f, idx) => (
          <div key={f.id} className="glass rounded-2xl p-5">
            <h3 className="font-semibold text-zinc-100 mb-3" style={{ color: idx === 0 ? COLOR_A : COLOR_B }}>
              {f.fullName}
            </h3>
            <dl className="space-y-2.5 text-sm">
              <StyleRow label="Style répertorié" value={f.fightingStyle ?? 'Non documenté'} />
              <StyleRow label="Garde" value={f.stance ?? 'Non documentée'} />
              <StyleRow
                label="Méthodes de victoire"
                value={
                  f.stats
                    ? [
                        f.stats.koPercentage != null ? `KO/TKO ${f.stats.koPercentage}%` : null,
                        f.stats.decisionPercentage != null ? `Décisions ${f.stats.decisionPercentage}%` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Non disponibles'
                    : 'Non disponibles'
                }
              />
              <StyleRow
                label="Victoires par KO / soumission"
                value={
                  f.record.winsByKo != null || f.record.winsBySub != null
                    ? `${f.record.winsByKo ?? '?'} KO · ${f.record.winsBySub ?? '?'} soumissions`
                    : 'Non disponibles'
                }
              />
            </dl>
          </div>
        ))}
      </div>
      {styleBlock && (
        <article className="glass-soft rounded-2xl p-5">
          <h4 className="font-semibold text-zinc-100 text-sm mb-2">{styleBlock.title}</h4>
          <p className="text-sm text-zinc-400 leading-relaxed">{styleBlock.text}</p>
        </article>
      )}
      <p className="text-[11px] text-zinc-600 px-1">
        Les styles sont ceux répertoriés par la source (ESPN) ; ils décrivent une tendance
        déclarative, pas une certitude tactique.
      </p>
    </div>
  )
}

function StyleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <dt className="text-zinc-500 text-xs">{label}</dt>
      <dd className="text-zinc-200 font-medium text-right">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet Sources
// ---------------------------------------------------------------------------

function SourcesTab({ data }: { data: FightAnalysis }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <h3 className="font-semibold text-zinc-100 mb-1 flex items-center gap-2">
        <ScanEye className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        Sources des informations
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        Chaque donnée affichée provient d&apos;une source identifiée et horodatée.
      </p>
      <ul className="space-y-2.5">
        {data.sources.map((s, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 bg-white/[0.03] border border-white/5"
          >
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 font-medium flex items-center gap-1.5 flex-wrap">
                {s.name}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300 hover:text-violet-200 inline-flex items-center gap-0.5 text-xs"
                  >
                    voir <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.detail}</p>
            </div>
            <time className="text-[11px] text-zinc-600 shrink-0" dateTime={s.syncedAt}>
              {formatDateFr(s.syncedAt, { weekday: undefined, year: undefined })}
            </time>
          </li>
        ))}
      </ul>
    </div>
  )
}
