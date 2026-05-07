'use client'

import { useEffect, useState } from 'react'
import { useLive } from './WebSocketProvider'

const CONGESTION_MAX = 10   // ring fills completely at this count
const CONGESTION_WARN = 4   // amber threshold
const CONGESTION_HIGH = 6   // red threshold

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function ringColor(count: number): string {
  if (count >= CONGESTION_HIGH) return '#e05c53'  // grafana red
  if (count >= CONGESTION_WARN) return '#f5a623'  // grafana amber
  return '#73bf69'                                 // grafana green
}

function congestionLabel(count: number): string {
  if (count >= CONGESTION_HIGH) return ''
  if (count >= CONGESTION_WARN) return ''
  return ''
}

interface RingMeterProps {
  count: number
  max: number
}

function RingMeter({ count, max }: RingMeterProps) {
  const size = 200
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Leave a 60° gap at the bottom so it looks like a gauge
  const arcFraction = 0.833           // 300° of 360°
  const arcLength = circumference * arcFraction
  const rotation = -210               // start at 7 o'clock
  const fill = Math.min(count / max, 1)
  const filledLength = arcLength * fill
  const color = ringColor(count)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0"
      aria-hidden
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#2d3038"
        strokeWidth={strokeWidth}
        strokeDasharray={`${arcLength} ${circumference}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
      />
      {/* Filled arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filledLength} ${circumference}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 600ms ease, stroke 600ms ease' }}
      />
    </svg>
  )
}

export default function CounterCard() {
  const { counter, state, lastUpdated } = useLive()
  const [ago, setAgo] = useState(() => timeAgo(lastUpdated))

  useEffect(() => {
    setAgo(timeAgo(lastUpdated))
    const id = setInterval(() => setAgo(timeAgo(lastUpdated)), 30_000)
    return () => clearInterval(id)
  }, [lastUpdated])

  const isCleaning = state === 'cleaning'
  const color = isCleaning ? '#f5a623' : ringColor(counter)
  const label = isCleaning ? 'Cleaning' : congestionLabel(counter)

  return (
    <div className={`rounded-lg border p-6 flex flex-col items-center gap-3 transition-all duration-300 ${
      isCleaning
        ? 'border-grafana-border bg-grafana-panel opacity-40 pointer-events-none'
        : 'border-grafana-border bg-grafana-panel'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-widest uppercase text-grafana-muted">
          Live Count
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          isCleaning
            ? 'bg-amber-900/50 text-grafana-amber'
            : 'bg-green-900/40 text-grafana-green'
        }`}>
          {isCleaning ? 'CLEANING' : 'COUNTING'}
        </span>
      </div>

      {/* Ring meter + counter */}
      <div className="relative w-[200px] h-[200px] flex items-center justify-center">
        <RingMeter count={isCleaning ? 0 : counter} max={CONGESTION_MAX} />
        <div className="flex flex-col items-center gap-1 z-10">
          <span
            className="text-7xl font-mono font-bold tabular-nums"
            style={{ color, transition: 'color 600ms ease' }}
          >
            {counter}
          </span>
          <span
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color, transition: 'color 600ms ease' }}
          >
            {label}
          </span>
        </div>
      </div>

      <span suppressHydrationWarning className="text-xs text-grafana-muted">
        Updated {ago}
      </span>
    </div>
  )
}
