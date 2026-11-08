'use client'

/**
 * VOLTRIX — Utilitaires d'appel API côté client.
 * Petit hook de récupération avec état de chargement/erreur et rechargement.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useApi<T>(url: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!url) return
    setLoading((prev) => (data === null && prev ? prev : true))
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Erreur ${res.status}`)
      }
      const json = (await res.json()) as T
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
  }, [url])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])

  useEffect(() => {
    if (!opts.pollMs || !url) return
    const t = setInterval(() => {
      void load()
    }, opts.pollMs)
    return () => clearInterval(t)
  }, [load, opts.pollMs, url])

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
