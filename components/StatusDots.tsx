'use client'

import { useLive } from './WebSocketProvider'

interface DotProps {
  active: boolean
  label: string
}

function Dot({ active, label }: DotProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${active ? 'bg-grafana-green' : 'bg-grafana-red'}`} />
      <span className="text-xs text-grafana-muted">{label}</span>
    </div>
  )
}

export default function StatusDots() {
  const { espConnected, wsConnected } = useLive()

  return (
    <div className="flex items-center gap-4">
      <Dot active={wsConnected} label="Browser" />
      <Dot active={espConnected} label="Device" />
    </div>
  )
}
