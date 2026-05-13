# borodutch-stream

Realtime activity stream service for borodutch projects.

## Overview

A lightweight authenticated live activity stream service. Any trusted bot or project can submit short activity strings via HTTP, and browser clients can watch a high-speed realtime feed via WebSocket.

## API

### POST /events

Submit a new activity event.

**Headers:**
- `Authorization: Bearer <STREAM_TOKEN>` — Required. 35-character secret token.

**Body:**
```json
{
  "text": "Chat 1***34***54 sent a message",
  "source": "voicy",
  "project": "voicy-bot"
}
```

- `text` (string, required) — Activity description. Max 500 characters.
- `source` (string, optional) — Source identifier.
- `project` (string, optional) — Project identifier.

**Response (200):**
```json
{
  "success": true,
  "event": {
    "id": "uuid",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "text": "Chat 1***34***54 sent a message",
    "source": "voicy",
    "project": "voicy-bot"
  }
}
```

### WebSocket /stream

Connect to receive realtime events.

**On connect:** Recent events from the ring buffer are replayed.

**Message format:**
```json
{
  "type": "event",
  "data": {
    "id": "uuid",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "text": "...",
    "source": "...",
    "project": "..."
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "connections": 42,
  "events": 150
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STREAM_TOKEN` | — | **Required.** 35-character secret token for event submission |
| `PORT` | `1340` | HTTP server port |
| `MAX_EVENTS` | `1000` | Maximum events kept in memory ring buffer |
| `MAX_PAYLOAD_LENGTH` | `500` | Maximum characters for event text |
| `MAX_CONNECTIONS` | `100` | Maximum concurrent WebSocket connections |
| `MAX_CONNECTIONS_PER_IP` | `5` | Maximum WebSocket connections per IP |
| `MAX_EVENTS_PER_SECOND_PER_SOURCE` | `10` | Rate limit per source per second |
| `CORS_ORIGIN` | `*` | CORS origin |

## Generate a 35-character token

```bash
node -e "console.log(require('crypto').randomBytes(26).toString('base64url').slice(0,35))"
```

## Deployment

Deployed via Nixpacks on EasyPanel/Hetzner.

## License

MIT
