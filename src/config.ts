import * as dotenv from 'dotenv'
dotenv.config({ path: `${__dirname}/../.env` })

export const config = {
  token: process.env.STREAM_TOKEN || '',
  port: parseInt(process.env.PORT || '1340', 10),
  maxEvents: parseInt(process.env.MAX_EVENTS || '1000', 10),
  maxPayloadLength: parseInt(process.env.MAX_PAYLOAD_LENGTH || '500', 10),
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '100', 10),
  maxConnectionsPerIp: parseInt(process.env.MAX_CONNECTIONS_PER_IP || '5', 10),
  maxEventsPerSecondPerSource: parseInt(
    process.env.MAX_EVENTS_PER_SECOND_PER_SOURCE || '10',
    10
  ),
  corsOrigin: process.env.CORS_ORIGIN || '*',
}

if (!config.token || config.token.length !== 35) {
  console.error(
    'STREAM_TOKEN must be exactly 35 characters. Generate one with:'
  )
  console.error(
    "node -e \"console.log(require('crypto').randomBytes(26).toString('base64url').slice(0,35))\""
  )
  process.exit(1)
}
