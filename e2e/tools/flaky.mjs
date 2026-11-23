// Runs the browser journeys N times (default 10) and reports the pass rate per test.
//   npm run flaky            or      RUNS=3 npm run flaky
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const RUNS = Number(process.env.RUNS ?? 10)
const files = ['journeys/a-d.test.mjs', 'journeys/e-h.test.mjs', 'journeys/failure-modes.test.mjs', 'journeys/i-twin.test.mjs']
const tally = new Map()
const runTimes = []
for (let i = 1; i <= RUNS; i++) {
  const t0 = Date.now()
  const r = spawnSync('node', ['--test', '--test-concurrency=1', '--test-timeout=240000', '--test-reporter=tap', ...files], { cwd: path.join(here, '..'), encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.stdout.includes('\nnot ok ')) {
    fs.mkdirSync(path.join(here, '../results/flaky-failures'), { recursive: true })
    fs.writeFileSync(path.join(here, `../results/flaky-failures/run-${i}.tap`), r.stdout)
  }
  runTimes.push(Math.round((Date.now() - t0) / 1000))
  for (const line of r.stdout.split('\n')) {
    const m = /^(not ok|ok) \d+ - (.+?)(?: # .*)?$/.exec(line)
    if (!m) continue
    const e = tally.get(m[2]) ?? { pass: 0, fail: 0, failures: [] }
    if (m[1] === 'ok') e.pass++
    else { e.fail++; e.failures.push(i) }
    tally.set(m[2], e)
  }
  console.log(`run ${i}/${RUNS} done in ${runTimes.at(-1)} s`)
}
const rows = [...tally].map(([name, e]) => ({ name, runs: e.pass + e.fail, pass: e.pass, fail: e.fail, passRate: `${Math.round((100 * e.pass) / (e.pass + e.fail))}%`, failedInRuns: e.failures }))
const out = { runs: RUNS, secondsPerRun: runTimes, tests: rows, allGreen: rows.every((r) => r.fail === 0) }
fs.writeFileSync(path.join(here, '../results/flaky.json'), JSON.stringify(out, null, 2))
console.table(rows.map(({ name, runs, pass, passRate }) => ({ name: name.slice(0, 70), runs, pass, passRate })))
process.exitCode = out.allGreen ? 0 : 1
