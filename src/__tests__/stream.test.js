process.env.PORT = '13402'

const WebSocket = require('ws')
const { server, wss } = require('../../dist/app')

describe('borodutch-stream', () => {
  beforeAll((done) => {
    setTimeout(done, 500)
  })

  afterAll((done) => {
    // Force close all client connections
    wss.clients.forEach((client) => {
      try {
        client.terminate()
      } catch (e) {
        // ignore
      }
    })
    setTimeout(() => {
      wss.close(() => {
        server.close(() => done())
      })
    }, 100)
  })

  test('health endpoint returns ok', async () => {
    const res = await fetch('http://localhost:13402/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(typeof data.connections).toBe('number')
    expect(typeof data.events).toBe('number')
  })

  test('POST /events without auth returns 401', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toBe('Unauthorized')
  })

  test('POST /events with invalid token returns 401', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token-thirty-five-chars-long!!',
      },
      body: JSON.stringify({ text: 'test' }),
    })
    expect(res.status).toBe(401)
  })

  test('POST /events with valid auth creates event', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-thirty-five-chars-long!!',
      },
      body: JSON.stringify({
        text: 'Hello world',
        source: 'test',
        project: 'test-project',
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.event.text).toBe('Hello world')
    expect(data.event.source).toBe('test')
    expect(data.event.project).toBe('test-project')
    expect(data.event.id).toBeDefined()
    expect(data.event.timestamp).toBeDefined()
  })

  test('POST /events with missing text returns 400', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-thirty-five-chars-long!!',
      },
      body: JSON.stringify({ source: 'test' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('text is required')
  })

  test('POST /events with large payload returns 400', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-thirty-five-chars-long!!',
      },
      body: JSON.stringify({ text: 'a'.repeat(501) }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('exceeds')
  })

  test('POST /events with invalid JSON returns 400', async () => {
    const res = await fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-thirty-five-chars-long!!',
      },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })

  test('WebSocket receives replay on connect', (done) => {
    fetch('http://localhost:13402/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-thirty-five-chars-long!!',
      },
      body: JSON.stringify({
        text: 'Replay test event',
        source: 'replay-test',
      }),
    }).then(() => {
      const ws = new WebSocket('ws://localhost:13402/stream')
      let received = false

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.data && msg.data.text === 'Replay test event') {
          received = true
          ws.close()
          expect(msg.type).toBe('event')
          expect(msg.data.source).toBe('replay-test')
          done()
        }
      })

      ws.on('close', () => {
        if (!received) {
          done(new Error('WebSocket closed without receiving expected event'))
        }
      })

      ws.on('error', (err) => done(err))
    })
  })

  test('WebSocket receives new events in realtime', (done) => {
    const ws = new WebSocket('ws://localhost:13402/stream')
    let received = false

    ws.on('open', () => {
      setTimeout(() => {
        fetch('http://localhost:13402/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token-thirty-five-chars-long!!',
          },
          body: JSON.stringify({
            text: 'Realtime event',
            source: 'realtime-test',
          }),
        })
      }, 100)
    })

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.data && msg.data.text === 'Realtime event') {
        received = true
        ws.close()
        expect(msg.type).toBe('event')
        expect(msg.data.source).toBe('realtime-test')
        done()
      }
    })

    ws.on('close', () => {
      if (!received) {
        done(new Error('WebSocket closed without receiving expected event'))
      }
    })

    ws.on('error', (err) => done(err))
  })
})
