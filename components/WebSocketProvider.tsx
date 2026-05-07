'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react'

export interface LiveState {
  counter: number
  state: 'counter' | 'cleaning'
  temp: number
  humidity: number
  lastUpdated: number
  cleaningStarted: number | null
  espConnected: boolean
  wsConnected: boolean
}

const defaultState: LiveState = {
  counter: 0,
  state: 'counter',
  temp: 0,
  humidity: 0,
  lastUpdated: Date.now(),
  cleaningStarted: null,
  espConnected: false,
  wsConnected: false,
}

const LiveContext = createContext<LiveState>(defaultState)

export function useLive() {
  return useContext(LiveContext)
}

interface Props {
  initial: Omit<LiveState, 'cleaningStarted' | 'espConnected' | 'wsConnected'>
  children: ReactNode
}

export function WebSocketProvider({ initial, children }: Props) {
  const [live, setLive] = useState<LiveState>({
    ...initial,
    cleaningStarted: initial.state === 'cleaning' ? initial.lastUpdated : null,
    espConnected: false,
    wsConnected: false,
  })

  const heartbeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current)
    setLive((prev) => ({ ...prev, espConnected: true }))
    heartbeatTimer.current = setTimeout(() => {
      setLive((prev) => ({ ...prev, espConnected: false }))
    }, 60_000)
  }, [])

  useEffect(() => {
    const wsUrl =
      typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
        : null

    if (!wsUrl) return

    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>
    let unmounted = false

    function connect() {
      ws = new WebSocket(wsUrl!)
      setLive((prev) => ({ ...prev, wsConnected: false }))

      ws.onopen = () => {
        setLive((prev) => ({ ...prev, wsConnected: true }))
      }

      ws.onmessage = (evt) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(evt.data as string) } catch { return }

        if (msg.type === 'heartbeat') {
          resetHeartbeatTimeout()
          return
        }

        if (msg.type === 'update') {
          const newState = msg.state as 'counter' | 'cleaning'
          setLive((prev) => {
            const cleaningStarted =
              newState === 'cleaning'
                ? prev.cleaningStarted ?? (msg.lastUpdated as number)
                : null
            return {
              ...prev,
              counter: msg.counter as number,
              state: newState,
              temp: msg.temp as number,
              humidity: msg.humidity as number,
              lastUpdated: msg.lastUpdated as number,
              cleaningStarted,
            }
          })
          resetHeartbeatTimeout()
        }
      }

      ws.onclose = () => {
        setLive((prev) => ({ ...prev, wsConnected: false }))
        if (!unmounted) reconnectTimer = setTimeout(connect, 5_000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      unmounted = true
      clearTimeout(reconnectTimer)
      if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current)
      ws?.close()
    }
  }, [resetHeartbeatTimeout])

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}
