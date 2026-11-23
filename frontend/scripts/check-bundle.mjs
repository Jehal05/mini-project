// Review item 10: fail the build check if the first screen needs too much JavaScript.
// "First load" = the entry chunk, everything it imports statically, plus the
// Patient dashboard page and its static imports (the default route). Lazy chunks
// such as the charts are not counted, because they load after the first paint.
// Usage: npm run build && node scripts/check-bundle.mjs [budgetKB]
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const dist = path.resolve(process.cwd(), 'dist')
const manifest = JSON.parse(readFileSync(path.join(dist, '.vite', 'manifest.json'), 'utf8'))
const budgetKB = Number(process.argv[2] ?? 300)

const seen = new Set()
function collect(key) {
  if (seen.has(key)) return
  seen.add(key)
  for (const dep of manifest[key].imports ?? []) collect(dep)
}

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)
collect(entryKey)
// The page may be keyed by its path or (when Vite merges shared code into it) by its chunk name.
const dashboardKey = Object.keys(manifest).find(
  (k) => k.endsWith('pages/PatientDashboard.jsx') || /\/PatientDashboard-[\w-]+\.js$/.test(manifest[k].file),
)
if (!dashboardKey) {
  console.error('Could not find the PatientDashboard chunk in the manifest.')
  process.exit(1)
}
collect(dashboardKey)

const files = [...seen].map((k) => manifest[k].file).filter((f) => f.endsWith('.js'))
const sizes = files.map((f) => ({ file: f, kb: statSync(path.join(dist, f)).size / 1024 }))
const total = sizes.reduce((a, b) => a + b.kb, 0)

for (const s of sizes.sort((a, b) => b.kb - a.kb)) console.log(`  ${s.kb.toFixed(1).padStart(7)} KB  ${s.file}`)
console.log(`First-load JS: ${total.toFixed(1)} KB (budget ${budgetKB} KB, before gzip)`)
if (total > budgetKB) {
  console.error('Over budget.')
  process.exit(1)
}
