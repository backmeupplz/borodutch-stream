// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config({ path: `${__dirname}/../.env` })

import * as http from 'http'
import * as crypto from 'crypto'
import * as WebSocket from 'ws'
import { config } from './config'
import { RingBuffer, Event } from './ringBuffer'

// State
const ringBuffer = new RingBuffer(config.maxEvents)
const sourceRateLimits = new Map<string, number[]>()
const ipConnections = new Map<string, number>()

// Helpers
function generateId(): string {
  return crypto.randomUUID()
}

function checkRateLimit(source: string): boolean {
  const now = Date.now()
  const window = 1000
  const timestamps = sourceRateLimits.get(source) || []
  const recent = timestamps.filter((t) => now - t < window)
  if (recent.length >= config.maxEventsPerSecondPerSource) {
    return false
  }
  recent.push(now)
  sourceRateLimits.set(source, recent)
  return true
}

function cleanupRateLimits() {
  const now = Date.now()
  for (const [source, timestamps] of sourceRateLimits) {
    const recent = timestamps.filter((t) => now - t < 1000)
    if (recent.length === 0) {
      sourceRateLimits.delete(source)
    } else {
      sourceRateLimits.set(source, recent)
    }
  }
}

setInterval(cleanupRateLimits, 5000)

// Broadcast to all connected WS clients
function broadcast(event: Event) {
  const message = JSON.stringify({ type: 'event', data: event })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// HTTP server
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        connections: wss.clients.size,
        events: ringBuffer.size(),
      })
    )
    return
  }

  // Submit event
  if (req.url === '/events' && req.method === 'POST') {
    const auth = req.headers['authorization'] || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (token !== config.token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)

        if (!data.text || typeof data.text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: false, error: 'text is required' })
          )
          return
        }

        if (data.text.length > config.maxPayloadLength) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: `text exceeds ${config.maxPayloadLength} characters`,
            })
          )
          return
        }

        const source = data.source || 'unknown'

        if (!checkRateLimit(source)) {
          res.writeHead(429, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: false, error: 'Rate limit exceeded' })
          )
          return
        }

        const event: Event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          text: data.text,
          source: data.source,
          project: data.project,
        }

        ringBuffer.push(event)
        broadcast(event)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, event }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
      }
    })
    return
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: false, error: 'Not found' }))
})

// WebSocket server
const wss = new WebSocket.Server({
  server,
  path: '/stream',
  perMessageDeflate: false,
})

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown'

  // Global connection limit
  if (wss.clients.size > config.maxConnections) {
    ws.close(1008, 'Too many connections')
    return
  }

  // Per-IP connection limit
  const currentIpCount = ipConnections.get(ip) || 0
  if (currentIpCount >= config.maxConnectionsPerIp) {
    ws.close(1008, 'Too many connections from this IP')
    return
  }
  ipConnections.set(ip, currentIpCount + 1)

  // Replay recent events
  const recentEvents = ringBuffer.getAll()
  for (const event of recentEvents) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'event', data: event }))
    }
  }

  ws.on('close', () => {
    const count = ipConnections.get(ip) || 1
    if (count <= 1) {
      ipConnections.delete(ip)
    } else {
      ipConnections.set(ip, count - 1)
    }
  })
})

// Ping clients periodically to detect dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.ping()
    }
  })
}, 30000)

// Graceful shutdown
function shutdown() {
  clearInterval(pingInterval)
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down')
  })
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { server, wss }

server.listen(config.port, () => {
  console.log(`Stream server running on port ${config.port}`)
})
