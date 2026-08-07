// One-off asset tool: traces the brand isotype mask (docs/isotipo-mask.png)
// into SVG paths scaled to the animation viewBox. Output is pasted into
// src/isotype.ts. Run: node scripts/trace-isotype.mjs
import potrace from 'potrace'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../docs/isotipo-mask.png', import.meta.url))

potrace.trace(SRC, { threshold: 128, turdSize: 50, optTolerance: 0.4, alphaMax: 1 }, (err, svg) => {
  if (err) throw err
  console.log(svg)
})
