import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { measureFacade, toDesignMetres } from './mediaFacade'
import { DESIGN_METRES_WIDE } from './content/towerContent'

// The screen's size is read off the mesh, and the city's export has its scale
// APPLIED at ~0.307. These two facts together are what the design width exists
// for, and both are arithmetic on geometry — no canvas, no renderer.

/** A strip `width` × `height`, bent round a quarter circle when `radius` is given. */
function strip(width: number, height: number, radius?: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 64, 1)
  if (radius) {
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const along = position.getX(i) + width / 2
      const angle = along / radius
      position.setXYZ(i, radius * Math.sin(angle), position.getY(i), radius * (1 - Math.cos(angle)))
    }
  }
  return geometry
}

describe('measuring the screen', () => {
  it('reads a flat strip at its size', () => {
    const size = measureFacade(strip(42.8, 154.06))
    expect(size.metresWide).toBeCloseTo(42.8, 4)
    expect(size.metresTall).toBeCloseTo(154.06, 4)
  })

  it('reads a curved strip along its arc, not across its bounding box', () => {
    const radius = 20
    const arc = (radius * Math.PI) / 2
    const size = measureFacade(strip(arc, 10, radius))
    expect(size.metresWide).toBeCloseTo(arc, 2)
  })
})

describe('the design width', () => {
  it('shows a screen exported at 0.307 exactly as one at full size', () => {
    const full = toDesignMetres(measureFacade(strip(42.8, 154.06)), DESIGN_METRES_WIDE)
    const shrunk = toDesignMetres(measureFacade(strip(42.8 * 0.307, 154.06 * 0.307)), DESIGN_METRES_WIDE)
    // Four places, not six: three stores positions as float32, so the shrunk
    // strip comes back a few micrometres off — far below anything drawn.
    expect(shrunk.metresWide).toBeCloseTo(full.metresWide, 4)
    expect(shrunk.metresTall).toBeCloseTo(full.metresTall, 4)
    expect(shrunk.metresTall).toBeCloseTo(154.06, 3)
  })

  it('keeps the measurement when no design width is given', () => {
    expect(toDesignMetres({ metresWide: 13.1, metresTall: 47.3 })).toEqual({
      metresWide: 13.1,
      metresTall: 47.3,
    })
  })
})
