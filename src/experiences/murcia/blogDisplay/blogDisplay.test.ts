import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BLOG_TRANSITION } from './blogTransition'
import { createBlogDisplay } from './blogDisplay'
import type { BlogDisplay } from './blogDisplay'

// THE CLAIM THE WHOLE TRANSITION RESTS ON: at the end of the approach the panel's
// readable core IS the viewport. Everything else about the flight is a camera move
// that a person has to judge by eye, but this one is arithmetic, and it is arithmetic
// that silently stops being true the moment `PANEL_HEIGHT`, the core inset or the
// overshoot moves.
//
// No shader compiles here and no GL context exists. The panel is a `PlaneGeometry`
// and a `ShaderMaterial`, both of which three builds on the CPU — the same reason
// `displayTouchTargets.test.ts` can measure the services display's controls without
// a browser.

/** The five viewports `displayTouchTargets.test.ts` sweeps, so both use one list. */
const VIEWPORTS = [
  { label: 'phone portrait', width: 393, height: 852 },
  { label: 'phone portrait (tall)', width: 412, height: 915 },
  { label: 'phone portrait (short)', width: 390, height: 844 },
  { label: 'phone landscape', width: 844, height: 390 },
  { label: 'desktop', width: 1600, height: 900 },
]

const FOV = 35

function makeDisplay(aspect: number): BlogDisplay {
  return createBlogDisplay({
    centre: new THREE.Vector3(120, 0, -40),
    groundY: 30,
    elevation: 19,
    aspect,
    tiltDegrees: 45,
    baseYawDegrees: 267,
  })
}

/** Where the approach ends: on the panel's normal, at the solved fill distance. */
function arrivalCamera(display: BlogDisplay, width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 1, 4000)
  const quaternion = display.panelQuaternion()
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
  const distance = (display.coreHeight() / 2 / Math.tan(halfFov)) * BLOG_TRANSITION.fillOvershoot
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)

  camera.position.copy(display.anchor()).addScaledVector(normal, distance)
  camera.quaternion.copy(quaternion)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

/** The readable core's four corners in world space, at the panel's own pose. */
function coreCorners(display: BlogDisplay, aspect: number): THREE.Vector3[] {
  const halfHeight = display.coreHeight() / 2
  const halfWidth = halfHeight * aspect
  const quaternion = display.panelQuaternion()
  const anchor = display.anchor()

  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [-halfWidth, halfHeight],
    [halfWidth, halfHeight],
  ].map(([x, y]) =>
    new THREE.Vector3(x, y, 0).applyQuaternion(quaternion).add(anchor),
  )
}

describe('the arrival pose fills the frame', () => {
  for (const { label, width, height } of VIEWPORTS) {
    it(`over-fills the viewport at ${label} (${width}x${height})`, () => {
      const aspect = width / height
      const display = makeDisplay(aspect)
      try {
        const camera = arrivalCamera(display, width, height)

        for (const corner of coreCorners(display, aspect)) {
          const ndc = corner.clone().project(camera)
          // Every corner of the readable core lands AT OR OUTSIDE the frame edge.
          // At exactly 1.0 a rounded corner or a half-pixel of antialiased fringe
          // would show at the one moment nothing may — which is what
          // `fillOvershoot` below 1 buys, so this is strictly greater.
          expect(Math.abs(ndc.x), `${label} x`).toBeGreaterThan(1)
          expect(Math.abs(ndc.y), `${label} y`).toBeGreaterThan(1)
          // And in front of the camera, not behind it.
          expect(ndc.z, `${label} z`).toBeLessThan(1)
        }
      } finally {
        display.dispose()
      }
    })
  }

  it('does not over-fill so far that the core stops being the whole frame', () => {
    // The other side of the same number. If the camera came much closer, the visitor
    // would arrive at a crop of the page rather than the page — and the document
    // that replaces it is not cropped.
    const display = makeDisplay(1600 / 900)
    try {
      const camera = arrivalCamera(display, 1600, 900)
      const ndc = coreCorners(display, 1600 / 900)[0]!.clone().project(camera)
      expect(Math.abs(ndc.y)).toBeLessThan(1.2)
    } finally {
      display.dispose()
    }
  })
})

describe('the panel takes the viewport it will have to become', () => {
  it('changes width with the aspect and holds its height', () => {
    // Height is what the elevation was derived against, so driving it from the
    // aspect would move the panel's clearance every time a window was resized.
    const display = makeDisplay(1)
    try {
      const before = display.coreHeight()
      display.setAspect(2.5)
      expect(display.coreHeight()).toBe(before)
    } finally {
      display.dispose()
    }
  })

  it('keeps the fill distance viewport-independent', () => {
    // It solves from the core's HEIGHT and the vertical fov, so a resize moves the
    // panel's shape without moving where the camera has to stand. That is what lets
    // the destination be re-solved every frame for free.
    const wide = makeDisplay(1600 / 900)
    const tall = makeDisplay(390 / 844)
    try {
      expect(wide.coreHeight()).toBe(tall.coreHeight())
    } finally {
      wide.dispose()
      tall.dispose()
    }
  })
})

describe('the plate still covers the face it carries', () => {
  it('bleeds further than the face fades', () => {
    // The face's alpha ramps to zero over `uEdgeFalloff`, measured OUTWARD from the
    // core's edge. If the plate stopped short of that, the soft fringe would hang
    // outside the plate's hard silhouette and the object would read with two edges a
    // fraction apart. This is the inequality that stops it.
    const display = makeDisplay(1600 / 900)
    try {
      const falloff = display.panelMaterial.uniforms['uEdgeFalloff']?.value as number
      // `SHELL_BLEED`, in world units, against a falloff expressed in panel heights.
      // Both halved on 2026-09-09; the inequality is what survives that, not the values.
      const bleed = 0.45
      const panelHeight = 24
      expect(falloff * panelHeight).toBeLessThan(bleed)
    } finally {
      display.dispose()
    }
  })

  it('opts out of tone mapping, because its reference is a browser', () => {
    // The panel has to draw a colour the way Chrome paints it: ACES turns `#ffffff`
    // into byte 226 and the error changes sign at mid-grey, so a paper page does not
    // dim on it — it S-curves. Both `#include`s stay in the shader; this flag is
    // what stops the first one doing anything, and it lives in TypeScript so it can
    // be found.
    const display = makeDisplay(1)
    try {
      expect(display.panelMaterial.toneMapped).toBe(false)
    } finally {
      display.dispose()
    }
  })
})

describe('the panel hangs above what it floats over', () => {
  it('measures its elevation from the given ground, not from the world origin', () => {
    const display = makeDisplay(1)
    try {
      expect(display.anchor().y).toBe(30 + 19)
      expect(display.anchor().x).toBe(120)
      expect(display.anchor().z).toBe(-40)
    } finally {
      display.dispose()
    }
  })

  it('rests at the yaw it was given, so it faces an arriving visitor', () => {
    const display = makeDisplay(1)
    try {
      const euler = new THREE.Euler().setFromQuaternion(display.panelQuaternion(), 'YXZ')
      expect(THREE.MathUtils.radToDeg(euler.y)).toBeCloseTo(267 - 360, 6)
    } finally {
      display.dispose()
    }
  })
})
