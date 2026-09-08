import * as THREE from 'three'
import { frustumExtents } from './logoMotion'

/**
 * The phone menu's burger, drawn as geometry at the header's RIGHT corner.
 *
 * The header's two ends are one composition and are now drawn by one pass: the
 * brand mark at the left inset, these bars at the right. This module is a
 * second group in the corner logo's own scene, on its camera — not a second
 * overlay pass, not a canvas of its own (DECISIONS §26.16).
 *
 * Pure in the same sense logoMotion is: no DOM, no config, no I/O. Every number
 * it draws with arrives through `set()` in CSS pixels, measured off the flat
 * bars by CornerLogoLayer, because `siteHeader.css` is the single owner of the
 * burger's length, thickness, pitch and count and there is to be no second copy
 * of them here.
 *
 * ── Why it is built hidden, and stays hidden until measured ──
 *
 * `createCornerLogo` is not the scene's alone: `blog/headerLogoRuntime.ts`
 * builds the same thing on its own 44x44 renderer for the blog's bar
 * (`adr/013`). Anything added VISIBLE to that scene appears on the blog's mark
 * too. The blog never measures a burger, so it never calls `set()` with
 * anything, so these bars are four invisible meshes there and the cold blog's
 * 3D allow-list is untouched.
 */

/** The burger button's bars, in CSS px, as measured off the DOM. */
export interface HeaderBurgerMetrics {
  /** How many bars the stylesheet draws. Read, never assumed. */
  count: number
  /** The stack's centre, px from the surface's RIGHT edge — the inset it hugs. */
  centerRightPx: number
  /** The stack's centre, px from the surface's top. */
  centerYPx: number
  barLengthPx: number
  barThicknessPx: number
  /** Centre-to-centre spacing between neighbours, px. */
  pitchPx: number
  /** The ground the bars sit on — the header's `data-tone`. */
  tone: 'dark' | 'light'
}

export interface HeaderBurger {
  /** Added to the overlay scene by the caller, as `modelGroup` is. */
  readonly group: THREE.Group
  /** Draw these bars, or hide them entirely when null. */
  set(metrics: HeaderBurgerMetrics | null): void
  /** Re-anchor from the live camera. Called per frame, as the logo's corner is. */
  update(): void
  /** The height of the surface being drawn into — see `LogoMotion.setSurfaceHeight`. */
  setSurfaceHeight(px: number): void
}

/** How far a bar is extruded toward the viewer, in CSS px. */
const DEPTH_PX = 3

/**
 * The static pose, in radians, applied to the GROUP so the stack keeps one
 * coherent angle.
 *
 * A pitch shows the top face and a yaw shows an end cap; without both, an unlit
 * box is a flat rectangle no matter how it is turned. The front face stays
 * dominant at these angles, so it still reads as a burger. Safe to rotate the
 * whole stack only because `cornerFramePadding` flattens the frustum toward
 * orthographic (extraction 001 §5): the bars swing a couple of pixels in Z and
 * do not change size, so the spacing stays even.
 */
const PITCH_RAD = 0.4
const YAW_RAD = -0.35

/**
 * Three shades per tone: the face toward the viewer, the face the pitch reveals,
 * and everything else.
 *
 * DETERMINISTIC SHADING RATHER THAN LIGHTS, and the reason is the light tone.
 * Lighting only ever darkens a base colour toward black; on Murcia the bars are
 * near-black on a pale sky, so the facets have to come out LIGHTER than the
 * front face or the slab is a blob. A table goes both directions. It also keeps
 * the scene's standing "no lights" (plan 019 §3) and keeps every material here
 * on the mark's own `MeshBasicMaterial` program, which is what the one
 * `compileAsync` in createCornerLogo already covers.
 *
 * The front face carries the contrast `siteHeader.css` argues for the flat bars
 * (ink on Murcia's sky at 7.4:1, white on the black sky); the darkest facet
 * still clears 3:1 on its own ground, so the silhouette never dissolves.
 */
const SHADES = {
  dark: { front: 0xffffff, top: 0xd6dae2, side: 0x9aa1ad },
  light: { front: 0x0b0b0d, top: 0x2b2f36, side: 0x474d56 },
} as const

/**
 * BoxGeometry's six material groups, in the order it emits them.
 *
 * The pose turns the +Y face and one +X cap toward the viewer; -Y, -Z and the
 * far cap are never seen, so they take the side shade and the slab needs three
 * materials rather than six.
 */
const FACE_SLOTS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const

export function createHeaderBurger(camera: THREE.PerspectiveCamera): HeaderBurger {
  const group = new THREE.Group()
  group.visible = false
  group.rotation.set(PITCH_RAD, YAW_RAD, 0)

  // One unit box scaled per bar, and one six-slot material array shared by all
  // of them. Disposal is the scene's: disposeObject3D traverses and collects
  // materials into a Set, so these three are released once; the geometry gets
  // dispose() once per mesh, which is safe because three removes its own
  // listener on the first call.
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const side = new THREE.MeshBasicMaterial({ toneMapped: false })
  const top = new THREE.MeshBasicMaterial({ toneMapped: false })
  const front = new THREE.MeshBasicMaterial({ toneMapped: false })
  const materials = FACE_SLOTS.map((face) =>
    face === '+Z' ? front : face === '+Y' ? top : side,
  )

  const bars: THREE.Mesh[] = []
  let metrics: HeaderBurgerMetrics | null = null
  let surfaceHeightPx: number | null = null

  /** Grow or shrink the stack to `count`. Only a count change touches the scene graph. */
  function resize(count: number): void {
    while (bars.length < count) {
      const bar = new THREE.Mesh(geometry, materials)
      bars.push(bar)
      group.add(bar)
    }
    while (bars.length > count) {
      const bar = bars.pop()
      if (bar) group.remove(bar)
    }
  }

  /**
   * Lay the bars out in CSS pixels about the group's origin.
   *
   * The stack's CENTRE is the anchor — the bars are centred in the button by
   * construction, so placing the centre needs no bar-length term. Index 0 is
   * the topmost bar on screen, hence the negated offset: screen Y grows down,
   * world Y grows up.
   */
  function layout(next: HeaderBurgerMetrics): void {
    const half = (next.count - 1) / 2
    bars.forEach((bar, i) => {
      bar.scale.set(next.barLengthPx, next.barThicknessPx, DEPTH_PX)
      bar.position.set(0, -(i - half) * next.pitchPx, 0)
    })
    const shades = SHADES[next.tone]
    front.color.setHex(shades.front)
    top.color.setHex(shades.top)
    side.color.setHex(shades.side)
  }

  /**
   * Put the stack where the metrics say, from the live camera.
   *
   * Recomputed on every frame that uses it, so a resize or a rotation
   * re-anchors the bars without anything having to notice the resize — the rule
   * `computeCornerTarget` follows for the mark at the other corner.
   */
  function anchor(): void {
    if (!metrics || !group.visible) return
    const { halfW, halfH, perPx } = frustumExtents(camera, surfaceHeightPx ?? window.innerHeight)
    // The bars are authored in CSS px, so one unit of that geometry is one
    // pixel once the group carries the scale.
    group.scale.setScalar(perPx)
    group.position.set(halfW - metrics.centerRightPx * perPx, halfH - metrics.centerYPx * perPx, 0)
  }

  return {
    group,

    set(next) {
      metrics = next
      if (!next) {
        // The desktop line, the intro before `hasActions`, and the blog.
        group.visible = false
        return
      }
      resize(next.count)
      layout(next)
      group.visible = true
      // Anchored here rather than on the next frame: `set()` is what a resize
      // and the tone flip both arrive through, and one frame drawn at the old
      // anchor is a visible jump.
      anchor()
    },

    update: anchor,

    setSurfaceHeight(px) {
      // Same guard as LogoMotion's: a zero-height surface is a measurement that
      // has not happened yet, and dividing by it makes every offset infinite.
      if (px > 0) surfaceHeightPx = px
    },
  }
}
