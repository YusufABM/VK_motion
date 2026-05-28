import db from '@/lib/db'
import { WebSocketProvider } from '@/components/WebSocketProvider'
import CounterCard from '@/components/CounterCard'
import SensorCard from '@/components/SensorCard'
import CleaningBanner from '@/components/CleaningBanner'
import HeatmapGrid from '@/components/HeatmapGrid'
import StatusDots from '@/components/StatusDots'
import DeviceFooter from '@/components/DeviceFooter'
import DashboardCards from '@/components/DashboardCards'

export const dynamic = 'force-dynamic'

interface HeatmapSlot {
  day: number
  hour: number
  avg: number
}

// Realistic fake traffic pattern — used when DB has no data yet
function fakeHeatmapSlots(): HeatmapSlot[] {
  // [day 1=Mon..7=Sun][hour slot index 0..11] → avg counter increments
  const pattern: number[][] = [
    // Mon–Fri: quiet mornings, busy midday, moderate evening
    [0, 0, 0, 0.2, 1.5, 4.8, 7.2, 8.9, 6.4, 3.1, 1.8, 0.4],
    [0, 0, 0, 0.3, 1.2, 5.1, 8.0, 9.2, 7.1, 3.4, 2.0, 0.3],
    [0, 0, 0, 0.1, 1.4, 4.6, 7.8, 8.5, 6.8, 3.0, 1.5, 0.2],
    [0, 0, 0, 0.2, 1.3, 4.9, 7.5, 8.8, 6.5, 2.9, 1.6, 0.3],
    [0, 0, 0, 0.1, 1.1, 4.4, 6.9, 7.8, 5.2, 2.2, 1.1, 0.1],
    // Sat–Sun: slower start, midday peak
    [0, 0, 0, 0,   0.4, 2.1, 5.3, 6.8, 5.9, 3.8, 2.4, 0.8],
    [0, 0, 0, 0,   0.2, 1.4, 4.1, 5.5, 4.6, 2.9, 1.5, 0.3],
  ]
  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
  const slots: HeatmapSlot[] = []
  for (let d = 1; d <= 7; d++) {
    for (let hi = 0; hi < hours.length; hi++) {
      const avg = pattern[d - 1][hi]
      if (avg > 0) slots.push({ day: d, hour: hours[hi], avg })
    }
  }
  return slots
}

function getInitialData() {
  const event = db.prepare(`
    SELECT counter, state, recorded_at AS lastUpdated
    FROM counter_events ORDER BY recorded_at DESC LIMIT 1
  `).get() as { counter: number; state: string; lastUpdated: number } | undefined

  const sensor = db.prepare(`
    SELECT temp, humidity FROM sensor_readings ORDER BY recorded_at DESC LIMIT 1
  `).get() as { temp: number; humidity: number } | undefined

  const fourWeeksAgo = Date.now() - 28 * 24 * 60 * 60 * 1000
  const heatmapRows = db.prepare(`
    SELECT
      CASE CAST(strftime('%w', recorded_at / 1000, 'unixepoch') AS INTEGER)
        WHEN 0 THEN 7
        ELSE CAST(strftime('%w', recorded_at / 1000, 'unixepoch') AS INTEGER)
      END AS day,
      (CAST(strftime('%H', recorded_at / 1000, 'unixepoch') AS INTEGER) / 2) * 2 AS hour,
      COUNT(*) AS total_events,
      COUNT(DISTINCT strftime('%Y-%W', recorded_at / 1000, 'unixepoch')) AS week_count
    FROM counter_events
    WHERE recorded_at >= ? AND state = 'counter'
    GROUP BY day, hour
  `).all(fourWeeksAgo) as { day: number; hour: number; total_events: number; week_count: number }[]

  const slots: HeatmapSlot[] = heatmapRows.map((r) => ({
    day: r.day,
    hour: r.hour,
    avg: r.week_count > 0 ? Math.round((r.total_events / r.week_count) * 10) / 10 : 0,
  }))

  const recordCount = (db.prepare('SELECT COUNT(*) AS n FROM counter_events').get() as { n: number }).n

  const lastHeartbeatRow = db.prepare(
    'SELECT recorded_at FROM heartbeats ORDER BY recorded_at DESC LIMIT 1'
  ).get() as { recorded_at: number } | undefined

  return {
    counter: event?.counter ?? 0,
    state: (event?.state ?? 'counter') as 'counter' | 'cleaning',
    temp: sensor?.temp ?? 0,
    humidity: sensor?.humidity ?? 0,
    lastUpdated: event?.lastUpdated ?? Date.now(),
    slots: slots.length > 0 ? slots : fakeHeatmapSlots(),
    recordCount,
    lastHeartbeat: lastHeartbeatRow?.recorded_at ?? null,
    serverStarted: Date.now(),
  }
}

function safeInitialData() {
  try {
    return getInitialData()
  } catch {
    return {
      counter: 0,
      state: 'counter' as const,
      temp: 0,
      humidity: 0,
      lastUpdated: Date.now(),
      slots: fakeHeatmapSlots(),
      recordCount: 0,
      lastHeartbeat: null,
      serverStarted: Date.now(),
    }
  }
}

export default function DashboardPage() {
  const data = safeInitialData()

  return (
    <WebSocketProvider
      initial={{
        counter: data.counter,
        state: data.state,
        temp: data.temp,
        humidity: data.humidity,
        lastUpdated: data.lastUpdated,
      }}
    >
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-grafana-text tracking-tight">VKMotion</h1>
            <p className="text-xs text-grafana-muted">Live People Counter</p>
          </div>
          <StatusDots />
        </header>

        {/* Main cards — swaps between counter/sensor and cleaning banner */}
        <DashboardCards />

        {/* Heatmap */}
        <HeatmapGrid slots={data.slots} />

        {/* Footer */}
        <DeviceFooter
          recordCount={data.recordCount}
          lastHeartbeat={data.lastHeartbeat}
          serverStarted={data.serverStarted}
        />
      </main>
    </WebSocketProvider>
  )
}
