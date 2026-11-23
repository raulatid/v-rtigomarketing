import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The focus ring has two tones (accessibility audit 2026-11-18, V2): every
// ring drawn OUTSIDE its control also draws the dark halo of
// `--focus-halo-color` (siteHeader.css), or it vanishes over Murcia's sky.
// An inset ring sits on its own control's dark glass and needs none.

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(full)
    return entry.name.endsWith('.css') ? [full] : []
  })
}

describe('the two-tone focus ring', () => {
  it('pairs every outset ring with the dark halo, spread 4px past its offset', () => {
    const missing: string[] = []
    let rings = 0
    for (const file of cssFiles('src')) {
      const css = fs.readFileSync(file, 'utf8')
      for (const block of css.split('}')) {
        if (!block.includes('var(--focus-ring)')) continue
        const offset = Number(/outline-offset:\s*(-?\d+)px/.exec(block)?.[1] ?? '0')
        if (offset < 0) continue
        rings += 1
        const halo = /box-shadow:\s*([^;]+)/.exec(block)?.[1] ?? ''
        const ok =
          offset === 2 ? halo.includes('var(--focus-halo)') : halo.includes(`0 0 0 ${offset + 4}px var(--focus-halo-color)`)
        if (!ok) missing.push(`${file}: ${block.trim().split('{')[0]!.trim().slice(-60)}`)
      }
    }
    expect(rings).toBeGreaterThan(20)
    expect(missing).toEqual([])
  })
})
