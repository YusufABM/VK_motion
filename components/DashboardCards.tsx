'use client'

import { useLive } from './WebSocketProvider'
import CounterCard from './CounterCard'
import SensorCard from './SensorCard'
import CleaningBanner from './CleaningBanner'

export default function DashboardCards() {
  const { state } = useLive()
  const isCleaning = state === 'cleaning'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {isCleaning ? (
        <div className="col-span-full animate-[fadeIn_300ms_ease-in]">
          <CleaningBanner />
        </div>
      ) : (
        <>
          <div className="animate-[fadeIn_300ms_ease-in]">
            <CounterCard />
          </div>
          <div className="animate-[fadeIn_300ms_ease-in]">
            <SensorCard />
          </div>
        </>
      )}
    </div>
  )
}
