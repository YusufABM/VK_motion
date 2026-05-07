'use client'

import { useMemo } from 'react'

interface HeatmapSlot {
  day: number
  hour: number
  avg: number
}

interface Props {
  slots: HeatmapSlot[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

function hourLabel(h: number): string {
  return String(h).padStart(2, '0')
}

function interpolateColor(value: number, max: number): string {
  if (max === 0) return 'rgb(24,27,31)'
  const t = Math.min(value / max, 1)
  // Dark panel → cyan (#00b5d8)
  const r = Math.round(0 + t * 0)
  const g = Math.round(27 + t * (181 - 27))
  const b = Math.round(31 + t * (216 - 31))
  const alpha = 0.15 + t * 0.85
  return `rgba(${r},${g},${b},${alpha})`
}

export default function HeatmapGrid({ slots }: Props) {
  const grid = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of slots) map.set(`${s.day}-${s.hour}`, s.avg)
    return map
  }, [slots])

  const maxVal = useMemo(
    () => Math.max(0, ...slots.map((s) => s.avg)),
    [slots]
  )

  return (
    <div className="rounded-lg border border-grafana-border bg-grafana-panel p-4 flex flex-col gap-3">
      <span className="text-sm font-semibold tracking-widest uppercase text-grafana-muted">
        Congestion Heatmap — last 4 weeks
      </span>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs text-grafana-muted">
          <thead>
            <tr>
              <th className="w-10 pr-2 text-right font-normal" />
              {HOURS.map((h) => (
                <th key={h} className="px-0.5 pb-1 font-normal text-center whitespace-nowrap">
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((dayLabel, idx) => {
              const dayNum = idx + 1
              return (
                <tr key={dayNum}>
                  <td className="pr-2 text-right whitespace-nowrap py-0.5">{dayLabel}</td>
                  {HOURS.map((h) => {
                    const val = grid.get(`${dayNum}-${h}`) ?? 0
                    const bg = interpolateColor(val, maxVal)
                    const tooltip = `${dayLabel} ${hourLabel(h)}: avg ${val}`
                    return (
                      <td
                        key={h}
                        title={tooltip}
                        className="w-10 h-6 rounded-sm cursor-default transition-opacity hover:opacity-80"
                        style={{ backgroundColor: bg }}
                      />
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-grafana-muted">Low</span>
        <div
          className="h-2 w-32 rounded-full"
          style={{
            background: 'linear-gradient(to right, rgba(0,27,31,0.15), rgba(0,181,216,1))',
          }}
        />
        <span className="text-xs text-grafana-muted">High</span>
      </div>
    </div>
  )
}
