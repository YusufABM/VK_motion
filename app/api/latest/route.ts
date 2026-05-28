import { NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET() {
  try {
    const event = db.prepare(`
      SELECT counter, state, recorded_at AS lastUpdated
      FROM counter_events
      ORDER BY recorded_at DESC
      LIMIT 1
    `).get() as { counter: number; state: string; lastUpdated: number } | undefined

    const sensor = db.prepare(`
      SELECT temp, humidity
      FROM sensor_readings
      ORDER BY recorded_at DESC
      LIMIT 1
    `).get() as { temp: number; humidity: number } | undefined

    return NextResponse.json({
      counter: event?.counter ?? 0,
      state: event?.state ?? 'counter',
      temp: sensor?.temp ?? 0,
      humidity: sensor?.humidity ?? 0,
      lastUpdated: event?.lastUpdated ?? Date.now(),
    })
  } catch {
    return NextResponse.json(
      { counter: 0, state: 'counter', temp: 0, humidity: 0, lastUpdated: Date.now() },
      { status: 503 }
    )
  }
}
