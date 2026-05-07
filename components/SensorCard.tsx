'use client'

import { useLive } from './WebSocketProvider'

export default function SensorCard() {
  const { temp, humidity, lastUpdated, state } = useLive()
  const isCleaning = state === 'cleaning'

  return (
    <div className={`rounded-lg border border-grafana-border bg-grafana-panel p-6 flex flex-col gap-4 transition-all duration-300 ${
      isCleaning ? 'opacity-40 pointer-events-none' : ''
    }`}>
      <span className="text-sm font-semibold tracking-widest uppercase text-grafana-muted">
        Environment
      </span>

      <div className="flex gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-grafana-muted text-xs">Temperature</span>
          <span className="text-3xl font-mono font-semibold text-grafana-cyan">
            {Math.round(temp)}<span className="text-lg text-grafana-muted">°C</span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-grafana-muted text-xs">Humidity</span>
          <span className="text-3xl font-mono font-semibold text-grafana-cyan">
            {Math.round(humidity)}<span className="text-lg text-grafana-muted">%</span>
          </span>
        </div>
      </div>

      <span suppressHydrationWarning className="text-xs text-grafana-muted">
        Last reading: {new Date(lastUpdated).toLocaleTimeString()}
      </span>
    </div>
  )
}
