import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { attachWsServer } from './lib/ws-server'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  attachWsServer(httpServer)

  httpServer.listen(port, () => {
    console.log(`[next] Server ready on http://localhost:${port}`)
    console.log(`[ws]   WebSocket endpoint: ws://localhost:${port}/ws`)
  })
})
