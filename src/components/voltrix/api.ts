'use client'

/**
 * VOLTRIX — Utilitaires côté client.
 * Hook générique de chargement asynchrone (données ESPN appelées directement
 * par le navigateur) + formatage de dates en français.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Charge une donnée via une fonction asynchrone (loader), avec états de
 * chargement et d'erreur, et possibilité de rechargement manuel.
 *
 * `opts.key` : quand cette clé change (ex. fenêtre temporelle, identifiant
 * de combat), le loader est relancé et les données précédentes sont effacées.
 * Sans clé, le loader n'est exécuté qu'au montage et via reload().
 */
export function useAsyncData<T>(
  loader: (() => Promise<T>) | null,
  opts: { pollMs?: number; key?: string } = {}
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const lastKeyRef = useRef<string | undefined>(undefined)

  const load = useCallback(async () => {
    const fn = loaderRef.current
    if (!fn) return
    setLoading((prev) => (data === null && prev ? prev : true))
    try {
      const json = await fn()
      if (mounted.current) {
        setData(json)
        setError(null)
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [data === null])

  useEffect(() => {
    mounted.current = true
    if (opts.key != null && lastKeyRef.current !== opts.key) {
      lastKeyRef.current = opts.key
      setData(null)
      setError(null)
    }
    void load()
    return () => {
      mounted.current = false
    }
  }, [load, opts.key])

  useEffect(() => {
    if (!opts.pollMs) return
    const t = setInterval(() => void load(), opts.pollMs)
    return () => clearInterval(t)
  }, [load, opts.pollMs])

  return { data, loading, error, reload: load }
}

export function formatDateFr(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...opts,
    timeZone: 'UTC',
  }).format(d)
}

export function formatDateTimeFr(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}

export function formatTimeFr(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}
