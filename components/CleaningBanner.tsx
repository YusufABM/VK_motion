'use client'

import { useEffect, useState } from 'react'
import { useLive } from './WebSocketProvider'

function minutesAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000)
  if (diff < 1) return 'just now'
  return `${diff} minute${diff === 1 ? '' : 's'} ago`
}

export default function CleaningBanner() {
  const { cleaningStarted } = useLive()
  const [label, setLabel] = useState(() =>
    cleaningStarted ? minutesAgo(cleaningStarted) : 'just now'
  )

  useEffect(() => {
    if (!cleaningStarted) return
    setLabel(minutesAgo(cleaningStarted))
    const id = setInterval(() => setLabel(minutesAgo(cleaningStarted)), 30_000)
    return () => clearInterval(id)
  }, [cleaningStarted])

  return (
    <div className="rounded-lg border border-grafana-amber bg-grafana-panel p-10 flex flex-col items-center gap-4 animate-pulse-glow">
      <span className="text-6xl">🧹</span>
      <h2 className="text-2xl font-bold tracking-wide text-grafana-amber uppercase">
        Cleaning in Progress
      </h2>
      <p className="text-grafana-muted text-sm">Paused — gym is being cleaned</p>
      <p suppressHydrationWarning className="text-xs text-grafana-muted">Started {label}</p>
    </div>
  )
}
