import { describe, expect, it } from 'vitest'
import { parseTowerContent } from './parseTowerContent'
import { TOWER_DOCUMENT } from './towerContent'

// The gate a CMS document will have to pass, asserted on the bundled document
// after a JSON round trip — which is exactly what a query's result looks like —
// and on the ways a hand-written one goes wrong.

const document = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(TOWER_DOCUMENT)) as Record<string, unknown>

describe('the tower content', () => {
  it('accepts the bundled document once serialised', () => {
    const parsed = parseTowerContent(document())
    expect(parsed?.compositions.map((entry) => entry.id)).toEqual(['tower', 'tower-brand'])
    expect(parsed?.rotation).toEqual({ compositions: ['tower', 'tower-brand'], seconds: 5 })
  })

  it('treats an absent rotation as none rather than as a failure', () => {
    const raw = document()
    delete raw.rotation
    expect(parseTowerContent(raw)?.rotation).toBeNull()
  })

  it('rejects a rotation naming a composition that does not exist', () => {
    // Skipping it would leave a slide dark for its whole turn, every cycle.
    const raw = document()
    raw.rotation = { compositions: ['tower', 'missing'], seconds: 5 }
    expect(parseTowerContent(raw)).toBeNull()
  })

  it('rejects an interval that is not a positive number of seconds', () => {
    for (const seconds of [0, -5, '5', Number.NaN]) {
      const raw = document()
      raw.rotation = { compositions: ['tower'], seconds }
      expect(parseTowerContent(raw)).toBeNull()
    }
  })

  it('rejects a duplicated composition id', () => {
    const raw = document()
    const [first] = raw.compositions as unknown[]
    raw.compositions = [first, first]
    raw.rotation = { compositions: ['tower'], seconds: 5 }
    expect(parseTowerContent(raw)).toBeNull()
  })

  it('rejects a block that names its own colour', () => {
    // A document may open the layout, never the palette.
    const raw = document()
    const [first] = raw.compositions as Array<{ blocks: Array<Record<string, unknown>> }>
    first!.blocks[1]!.color = '#ff0000'
    expect(parseTowerContent(raw)).toBeNull()
  })
})
