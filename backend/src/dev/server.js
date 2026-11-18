// Stand-alone dev server for Daksh's monitoring module, until Puneet's main
// Express/Socket.IO server is on main.
//
//   npm run dev                         uses MONGO_URI if set, otherwise a local
//                                       MongoDB kept in backend/.data (survives restarts)
//   MONGO_URI=mongodb://... npm run dev
//   PRESENTER_KEY=some-secret npm run dev   protects scenario switching (required when NODE_ENV=production)
//
// Then open the frontend (cd ../frontend && npm run dev).

import http from 'node:http'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { Server } from 'socket.io'
import { attachSimulation } from '../simulation/index.js'
import { seedPatients, backfillHistory } from './seed.js'

const PORT = Number(process.env.PORT ?? 4000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const here = path.dirname(fileURLToPath(import.meta.url))

async function connectMongo() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI)
    return { stop: () => mongoose.disconnect(), where: process.env.MONGO_URI }
  }
  // No MongoDB configured: run one locally and keep its files in backend/.data/mongo.
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  const dbPath = path.resolve(here, '../../.data/mongo')
  mkdirSync(dbPath, { recursive: true })
  const server = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: 27027 } })
  await mongoose.connect(server.getUri('healthtwin'))
  return {
    where: `local MongoDB in ${dbPath}`,
    stop: async () => {
      await mongoose.disconnect()
      await server.stop({ doCleanup: false })
    },
  }
}

async function main() {
  const db = await connectMongo()
  const patients = await seedPatients()
  if (process.env.BACKFILL !== '0') {
    const n = await backfillHistory(patients)
    if (n) console.log(`[dev] backfilled ${n} simulated readings`)
  }

  const app = express()
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
  app.get('/health', (_req, res) => res.json({ ok: true }))

  const server = http.createServer(app)
  const io = new Server(server, { cors: { origin: CLIENT_ORIGIN, credentials: true } })
  const engine = await attachSimulation({ app, io })

  server.listen(PORT, () => {
    console.log(`[dev] HealthTwin monitoring on http://localhost:${PORT}  (db: ${db.where})`)
    console.log(`[dev] monitoring ${engine.list().length} fictional patients; REST under /api/sim`)
    console.log(
      process.env.PRESENTER_KEY
        ? '[dev] presenter controls need the PRESENTER_KEY (x-presenter-key header)'
        : '[dev] presenter controls are OPEN (no PRESENTER_KEY set; fine for local demos only)',
    )
  })

  const shutdown = async () => {
    engine.stop()
    io.close()
    server.close()
    await db.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
