// One command to reset and seed the demo:   npm run demo      (from e2e/)   -> http://localhost:4000
// Every start is a brand-new database with the three fictional patients and 7 days of simulated history,
// so "reset" is just Ctrl+C and run it again (about 3 s). The frontend is the built one in e2e/dist.
import { startHarness } from '../harness/server.mjs'

const port = Number(process.env.PORT ?? 4000)
const roundSeconds = Number(process.env.EMERGENCY_ROUND_SECONDS ?? 25)
const t0 = Date.now()
const stack = await startHarness({ port, roundSeconds, tickMs: 2000, quiet: false })
console.log(`\nHealthTwin demo ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (fresh database, 3 fictional patients)`)
console.log(`  Patient portal (Rahul):  ${stack.url}/patient/HT-2026-0001`)
console.log(`  Presenter panel:         ${stack.url}/presenter`)
console.log(`  FAKE hospital console:   ${stack.url}/__e2e/hospital   (stand-in for Puneet's portal)`)
console.log(`  Hospital search round:   ${roundSeconds} s (set EMERGENCY_ROUND_SECONDS to change)`)
console.log('  Reset: press Ctrl+C and run "npm run demo" again.\n')
const bye = async () => { await stack.stop(); process.exit(0) }
process.on('SIGINT', bye)
process.on('SIGTERM', bye)
