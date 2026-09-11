// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createMediaFacade, measureFacade, toDesignMetres } from './mediaFacade'
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

// The two things the services campus's ring strip needs from the engine, and
// the tower must not notice. A facade needs a 2D context to be BUILT, and
// jsdom has none, so construction gets one that does nothing: nothing below
// draws, it only reads what the facade put on its material and textures.
describe('the scroll and the flip', () => {
  afterEach(() => vi.restoreAllMocks())

  function facade(options: { flipY?: boolean } = {}) {
    const inert: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
      get: () => () => {},
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(inert as never)
    // jsdom has no FontFace, so the facade's font load warns; that is not under test.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mesh = new THREE.Mesh(strip(40, 4))
    const built = createMediaFacade({ mesh, resolution: 256, anisotropy: 1, ...options })
    const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms
    return { built, uniforms }
  }

  it('holds the picture still unless asked, and uploads unflipped, as the tower always has', () => {
    const { built, uniforms } = facade()
    built.update(1)
    expect(uniforms['uScroll']!.value).toBe(0)
    expect((uniforms['uMapA']!.value as THREE.Texture).flipY).toBe(false)
    expect((uniforms['uMapB']!.value as THREE.Texture).flipY).toBe(false)
  })

  it('slides the picture by turns per second, and wraps rather than growing', () => {
    const { built, uniforms } = facade()
    built.setScroll(0.25)
    for (let i = 0; i < 5; i++) built.update(1)
    // 1.25 turns: a whole lap and a quarter, held in [0, 1) so the shader's
    // fract() never meets a float that has lost its fraction to magnitude.
    expect(uniforms['uScroll']!.value).toBeCloseTo(0.25, 6)
    built.setScroll(0)
    built.update(1)
    expect(uniforms['uScroll']!.value).toBeCloseTo(0.25, 6)
  })

  it('flips the upload when the screen\'s v runs bottom to top', () => {
    const { uniforms } = facade({ flipY: true })
    expect((uniforms['uMapA']!.value as THREE.Texture).flipY).toBe(true)
    expect((uniforms['uMapB']!.value as THREE.Texture).flipY).toBe(true)
  })
})
