import { NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET() {
  const fourWeeksAgo = Date.now() - 28 * 24 * 60 * 60 * 1000

  // Group by ISO weekday (1=Mon…7=Sun) and 2-hour slot
  // SQLite strftime('%w') → 0=Sun…6=Sat; we remap to 1=Mon…7=Sun
  const rows = db.prepare(`
    SELECT
      CASE CAST(strftime('%w', recorded_at / 1000, 'unixepoch') AS INTEGER)
        WHEN 0 THEN 7
        ELSE CAST(strftime('%w', recorded_at / 1000, 'unixepoch') AS INTEGER)
      END AS day,
      (CAST(strftime('%H', recorded_at / 1000, 'unixepoch') AS INTEGER) / 2) * 2 AS hour,
      COUNT(*) AS total_events,
      COUNT(DISTINCT strftime('%Y-%W', recorded_at / 1000, 'unixepoch')) AS week_count
    FROM counter_events
    WHERE recorded_at >= ?
      AND state = 'counter'
    GROUP BY day, hour
  `).all(fourWeeksAgo) as { day: number; hour: number; total_events: number; week_count: number }[]

  const slots = rows.map((r) => ({
    day: r.day,
    hour: r.hour,
    avg: r.week_count > 0 ? Math.round((r.total_events / r.week_count) * 10) / 10 : 0,
  }))

  return NextResponse.json({ slots })
}
