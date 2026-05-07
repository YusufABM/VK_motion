'use client'

import { useEffect, useState } from 'react'

interface Props {
  recordCount: number
  lastHeartbeat: number | null
  serverStarted: number
}

function uptimeString(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function DeviceFooter({ recordCount, lastHeartbeat, serverStarted }: Props) {
  const [uptime, setUptime] = useState(() => uptimeString(serverStarted))

  useEffect(() => {
    const id = setInterval(() => setUptime(uptimeString(serverStarted)), 10_000)
    return () => clearInterval(id)
  }, [serverStarted])

  const hbLabel = lastHeartbeat
    ? new Date(lastHeartbeat).toLocaleTimeString()
    : 'never'

  return (
    <div className="flex flex-wrap gap-4 text-xs text-grafana-muted border-t border-grafana-border pt-3 mt-1">
      <span>Server uptime: <span suppressHydrationWarning className="text-grafana-text">{uptime}</span></span>
      <span>Last heartbeat: <span suppressHydrationWarning className="text-grafana-text">{hbLabel}</span></span>
      <span>DB records: <span className="text-grafana-text">{recordCount.toLocaleString()}</span></span>
    </div>
  )
}
