import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage, Server } from 'http'
import { Duplex } from 'stream'
import db from './db'

interface EspCounterMsg {
  counter: number
  state: 'counter' | 'cleaning'
  temp?: number
  humidity?: number
}

interface EspHeartbeatMsg {
  heartbeat: number
}

type EspMessage = EspCounterMsg | EspHeartbeatMsg

let latestState = {
  counter: 0,
  state: 'counter' as 'counter' | 'cleaning',
  temp: 0,
  humidity: 0,
  lastUpdated: Date.now(),
}

function isHeartbeat(msg: EspMessage): msg is EspHeartbeatMsg {
  return 'heartbeat' in msg
}

function broadcast(wss: WebSocketServer, payload: object) {
  const text = JSON.stringify(payload)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(text)
  }
}

export function attachWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

  // Only upgrade requests at /ws path
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', (socket, req) => {
    const origin = req.socket.remoteAddress ?? 'unknown'
    console.log(`[ws] Client connected: ${origin}`)

    // Send current state immediately
    socket.send(JSON.stringify({ type: 'update', ...latestState }))

    socket.on('message', (raw) => {
      let msg: EspMessage
      try {
        msg = JSON.parse(raw.toString()) as EspMessage
      } catch {
        return
      }

      if ('type' in msg && (msg as Record<string, unknown>).type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (isHeartbeat(msg)) {
        db.prepare('INSERT INTO heartbeats (recorded_at) VALUES (?)').run(Date.now())
        broadcast(wss, { type: 'heartbeat' })
        return
      }

      const now = Date.now()
      const { counter, state, temp = latestState.temp, humidity = latestState.humidity } = msg

      db.prepare(
        'INSERT INTO counter_events (counter, state, recorded_at) VALUES (?, ?, ?)'
      ).run(counter, state, now)

      db.prepare(
        'INSERT INTO sensor_readings (temp, humidity, recorded_at) VALUES (?, ?, ?)'
      ).run(temp, humidity, now)

      latestState = { counter, state, temp, humidity, lastUpdated: now }
      broadcast(wss, { type: 'update', counter, state, temp, humidity, lastUpdated: now })
    })

    socket.on('close', (code, reason) =>
      console.log(`[ws] Client disconnected: ${origin} — code: ${code}, reason: "${reason.toString()}"`)
    )
    socket.on('error', (err) => console.error(`[ws] Socket error (${origin}):`, err.message))
  })

  console.log('[ws] WebSocket server attached at /ws')
  return wss
}
