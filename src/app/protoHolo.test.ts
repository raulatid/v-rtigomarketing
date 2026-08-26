import { describe, expect, it } from 'vitest'
import { parseProtoHoloParams } from './protoHolo'

// Same property protoSky.test.ts guards: with no `?holo=1` in the URL, nothing
// this module reports can change what the panels render.

describe('the hologram inspection gate', () => {
  it('is inert with no query at all', () => {
    expect(parseProtoHoloParams('')).toEqual({ active: false, expand: null, freeze: false })
  })

  it('ignores the knobs when the gate is not open', () => {
    // A stray `?holoExpand=1` in a shared URL must not pin every panel open.
    const p = parseProtoHoloParams('?holoExpand=1&holoFreeze=1')
    expect(p.active).toBe(false)
    expect(p.expand).toBeNull()
    expect(p.freeze).toBe(false)
  })

  it('reads a full request', () => {
    expect(parseProtoHoloParams('?holo=1&holoExpand=0.5&holoFreeze=1')).toEqual({
      active: true,
      expand: 0.5,
      freeze: true,
    })
  })

  it('distinguishes holoExpand=0 from no pin', () => {
    // 0 is the resting state pinned; null lets selection drive the panel.
    expect(parseProtoHoloParams('?holo=1&holoExpand=0').expand).toBe(0)
    expect(parseProtoHoloParams('?holo=1').expand).toBeNull()
  })

  it('clamps the pin to the unit range and refuses junk', () => {
    expect(parseProtoHoloParams('?holo=1&holoExpand=7').expand).toBe(1)
    expect(parseProtoHoloParams('?holo=1&holoExpand=-2').expand).toBe(0)
    expect(parseProtoHoloParams('?holo=1&holoExpand=abc').expand).toBeNull()
    expect(parseProtoHoloParams('?holo=1&holoExpand=').expand).toBeNull()
  })
})
