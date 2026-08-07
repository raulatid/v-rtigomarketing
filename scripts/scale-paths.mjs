// One-off asset tool: scales the potrace output (docs/isotipo-traced.svg)
// into the 400x400 animation viewBox and prints one d-string per subpath.
// Run: node scripts/scale-paths.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SVG = readFileSync(
  fileURLToPath(new URL('../docs/isotipo-traced.svg', import.meta.url)),
  'utf8',
)

const SRC_W = 2167
const SRC_H = 2253
const BOX = 400
const s = BOX / SRC_H
const dx = (BOX - SRC_W * s) / 2
const dy = 0

const d = SVG.match(/d="([^"]+)"/)[1]
const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g)

let out = []
let current = ''
let isX = true
for (const t of tokens) {
  if (/[MLCZ]/.test(t)) {
    if (t === 'M' && current) {
      out.push(current.trim())
      current = ''
    }
    current += (t === 'M' && !current ? '' : ' ') + t
    isX = true
  } else {
    const n = Number(t)
    const v = isX ? n * s + dx : n * s + dy
    current += ' ' + v.toFixed(2)
    isX = !isX
  }
}
if (current) out.push(current.trim())

out.forEach((p, i) => console.log(`--- subpath ${i} ---\n${p}\n`))
