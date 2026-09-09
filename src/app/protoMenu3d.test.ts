import { describe, expect, it } from 'vitest'
import { parseProtoMenu3dParams } from './protoMenu3d'

// Same property protoHolo.test.ts guards: with no `?menu3d=1` in the URL,
// nothing this module reports can change how the card moves.

describe('the phone menu tuning gate', () => {
  it('is inert with no query at all', () => {
    expect(parseProtoMenu3dParams('')).toEqual({ active: false, vars: {} })
  })

  it('ignores the knobs when the gate is not open', () => {
    // A stray `?tilt=80` in a shared URL must not fold the scene in half.
    const p = parseProtoMenu3dParams('?tilt=80&y=90')
    expect(p.active).toBe(false)
    expect(p.vars).toEqual({})
  })

  it('reads a full request, in the units the stylesheet expects', () => {
    expect(
      parseProtoMenu3dParams(
        '?menu3d=1&y=42&z=-140&tilt=8&scale=0.96&radius=18&persp=1200&hinge=100&eye=50',
      ),
    ).toEqual({
      active: true,
      vars: {
        '--menu-3d-y': '42vh',
        '--menu-3d-z': '-140px',
        '--menu-3d-tilt': '8deg',
        '--menu-3d-scale': '0.96',
        '--menu-3d-radius': '18px',
        '--menu-3d-perspective': '1200px',
        '--menu-3d-hinge': '100%',
        '--menu-3d-eye': '50%',
      },
    })
  })

  it('writes only what was asked for, so the rest keeps the stylesheet', () => {
    expect(parseProtoMenu3dParams('?menu3d=1&tilt=12').vars).toEqual({ '--menu-3d-tilt': '12deg' })
    expect(parseProtoMenu3dParams('?menu3d=1').vars).toEqual({})
  })

  it('refuses junk and treats empty as absent', () => {
    const p = parseProtoMenu3dParams('?menu3d=1&tilt=abc&y=&z=12px')
    expect(p.active).toBe(true)
    expect(p.vars).toEqual({})
  })

  it('accepts zero, which is a value and not an absence', () => {
    expect(parseProtoMenu3dParams('?menu3d=1&tilt=0').vars).toEqual({ '--menu-3d-tilt': '0deg' })
  })
})
