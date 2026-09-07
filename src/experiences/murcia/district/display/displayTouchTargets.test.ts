import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { murciaConfig } from '../../config/murciaConfig'
import { resolveCameraPose } from '../../config/environmentConfig'
import type { CameraPoseConfig } from '../../config/environmentConfig'
import { CameraRig } from '../../camera/CameraRig'
import { scalePoseDistance } from '../../camera/applyPoseToCamera'
import { cityDistrictBindings } from '../../scene/cityDistrictBindings'
import {
  BACK_RECT,
  DETAIL_RECT,
  NEXT_RECT,
  PANEL_ELEVATION,
  PANEL_TILT_RADIANS,
  PREVIOUS_RECT,
  TOUCH_CONTROLS,
} from './displayConfig'
import type { DisplayControl, DisplayRect } from './displayConfig'
import { projectCoreRect } from './displayProjection'
import { MIN_TOUCH_TARGET_CSS_PX, expandToMinimum } from '../../../../interaction/touchTarget'
import type { ScreenBox } from '../../../../interaction/touchTarget'

// THE GUARD. What a finger meets on the display, in CSS pixels, at the poses
// the district can actually be in — computed through the REAL camera pose, the
// REAL rig and the REAL panel geometry, never a stand-in.
//
// This exists because the controls shrank to ~17 px on a phone through two
// changes that never touched the display: `CAMERA_DISTANCE` 195 -> 285 on
// 2026-09-04, and the rect retune of 2026-09-06. Nothing coupled the camera to
// the controls, so nothing failed. Now the coupling IS the test: move the
// camera, the fov, the flight's distance scale, the panel or a rect, and if a
// control's grown target falls under the floor at a supported viewport, this
// goes red with the number in the message.
//
// Sizes are in CSS px and nothing here knows about device pixels, which is the
// unit a finger is measured in.

const env = murciaConfig
const binding = cityDistrictBindings[0]!
const FLOOR = MIN_TOUCH_TARGET_CSS_PX

/** A point in the service cluster; the plaza the flight centres on. */
const FOCUS = { x: -144, z: 425 }

interface Viewport {
  label: string
  width: number
  height: number
  /** Portrait phones and the desktop must give every control its full zone. */
  fullZone: boolean
}

const VIEWPORTS: Viewport[] = [
  { label: '393x852 iPhone-shaped portrait', width: 393, height: 852, fullZone: true },
  { label: '412x915 Pixel 7 portrait', width: 412, height: 915, fullZone: true },
  { label: '390x844 portrait', width: 390, height: 844, fullZone: true },
  { label: '844x390 landscape', width: 844, height: 390, fullZone: false },
  { label: '1600x900 desktop', width: 1600, height: 900, fullZone: true },
]

/**
 * The poses the district can be entered at.
 *
 * `computeDestination` scales the rig's CURRENT pose by the binding's
 * `focusDistanceScale`, and the viewer's zoom band moves that pose between the
 * resting one and `zoomFar*`. So the furthest a control can ever be is the far
 * end of the band, dollied in by the same 0.78 — and that is the case that
 * bounds the floor.
 */
type Pose = 'default' | 'zoomed out'
const POSES: Pose[] = ['default', 'zoomed out']

function poseFor(kind: Pose, aspect: number): CameraPoseConfig {
  const resting = resolveCameraPose(env, aspect)
  const base: CameraPoseConfig =
    kind === 'default'
      ? resting
      : {
          ...resting,
          distance: env.zoomFarDistance,
          elevationDegrees: env.zoomFarElevationDegrees,
        }
  return scalePoseDistance(base, binding.focusDistanceScale ?? 1)
}

/**
 * The display as the district builds it: root above the plaza, yawed to face
 * the camera (the follow's resting answer), the face tilted by the fixed lean.
 */
function buildScene(viewport: Viewport, pose: Pose) {
  const aspect = viewport.width / viewport.height
  const camera = new THREE.PerspectiveCamera()
  const rig = new CameraRig(camera, poseFor(pose, aspect))
  rig.setAspect(aspect)
  rig.setYaw(binding.approachYawDegrees ?? 0)
  rig.setFocus(FOCUS.x, FOCUS.z)
  camera.updateMatrixWorld(true)

  const root = new THREE.Group()
  root.position.set(FOCUS.x, env.navigation.groundPlaneHeight + PANEL_ELEVATION, FOCUS.z)
  const toCamera = camera.position.clone().sub(root.position)
  root.rotation.y = Math.atan2(toCamera.x, toCamera.z)
  const panel = new THREE.Object3D()
  panel.rotation.x = PANEL_TILT_RADIANS
  root.add(panel)
  root.updateMatrixWorld(true)

  const canvas = { left: 0, top: 0, width: viewport.width, height: viewport.height }
  return { camera, panel, canvas }
}

interface Measured {
  control: DisplayControl
  drawn: ScreenBox
  grown: ScreenBox
}

function measure(scene: ReturnType<typeof buildScene>, control: DisplayControl, rect: DisplayRect): Measured {
  const drawn = projectCoreRect(rect, scene.panel, scene.camera, scene.canvas)
  if (!drawn) throw new Error(`${control} projected behind the camera`)
  return { control, drawn, grown: expandToMinimum(drawn) }
}

const width = (b: ScreenBox) => b.right - b.left
const height = (b: ScreenBox) => b.bottom - b.top
const centreX = (b: ScreenBox) => (b.left + b.right) / 2
const centreY = (b: ScreenBox) => (b.top + b.bottom) / 2
const separation = (a: ScreenBox, b: ScreenBox) =>
  Math.hypot(centreX(a) - centreX(b), centreY(a) - centreY(b))
const px = (n: number) => `${n.toFixed(1)}px`

/**
 * The floor a landscape phone's footer controls can honour.
 *
 * In landscape the whole 48-unit panel is ~135 CSS px tall and the three
 * footer controls sit on one row 0.37 of the core apart. At the default pose
 * that is 44.7 px between centres — the full zone, with less than a pixel to
 * spare. Zoomed all the way out it is ~32 px, closer than two 44 px zones side
 * by side, so each grown box is cut at the midpoint to its neighbour
 * (`resolveTouchTarget`). That is the geometric maximum for that pose, written
 * down so the case is asserted rather than waved at — against the ~6 px the
 * arrows are drawn at there. The close has no neighbour and keeps the full
 * floor everywhere.
 */
const LANDSCAPE_EXCLUSIVE_FLOOR_PX = { default: FLOOR, 'zoomed out': 30 } as const

describe('the display controls are at least a finger wide, after projection', () => {
  for (const viewport of VIEWPORTS) {
    for (const pose of POSES) {
      const label = `${viewport.label}, ${pose}`

      it(`${label}: every button's grown box meets the floor`, () => {
        const scene = buildScene(viewport, pose)
        for (const mode of ['summary', 'detail'] as const) {
          for (const [control, rect] of TOUCH_CONTROLS[mode]) {
            const m = measure(scene, control, rect)
            expect(
              width(m.grown),
              `${control} (${mode}) grown width, drawn ${px(width(m.drawn))} x ${px(height(m.drawn))}`,
            ).toBeGreaterThanOrEqual(FLOOR - 1e-6)
            expect(
              height(m.grown),
              `${control} (${mode}) grown height, drawn ${px(width(m.drawn))} x ${px(height(m.drawn))}`,
            ).toBeGreaterThanOrEqual(FLOOR - 1e-6)
          }
        }
      })

      it(`${label}: the close is in frame and nothing clips its zone`, () => {
        const scene = buildScene(viewport, pose)
        const close = measure(scene, 'close', BACK_RECT)
        // In frame: a floor on a control the viewer cannot see is no floor.
        expect(centreX(close.drawn), 'close centre x').toBeGreaterThan(0)
        expect(centreX(close.drawn), 'close centre x').toBeLessThan(viewport.width)
        expect(centreY(close.drawn), 'close centre y').toBeGreaterThan(0)
        expect(centreY(close.drawn), 'close centre y').toBeLessThan(viewport.height)
        // No other BUTTON's grown box reaches it. The detail viewport is not a
        // button and yields to the close by `controlAt`'s order.
        for (const [control, rect] of TOUCH_CONTROLS.summary) {
          if (control === 'back') continue
          const other = measure(scene, control, rect)
          expect(
            separation(close.drawn, other.drawn),
            `close to ${control}`,
          ).toBeGreaterThanOrEqual(FLOOR)
        }
      })

      it(`${label}: the footer's neighbours leave each other a usable zone`, () => {
        const scene = buildScene(viewport, pose)
        const previous = measure(scene, 'previous', PREVIOUS_RECT)
        const detail = measure(scene, 'detail', DETAIL_RECT)
        const next = measure(scene, 'next', NEXT_RECT)
        const gaps = [
          ['previous to detail', separation(previous.drawn, detail.drawn)],
          ['detail to next', separation(detail.drawn, next.drawn)],
        ] as const
        const floor = viewport.fullZone ? FLOOR : LANDSCAPE_EXCLUSIVE_FLOOR_PX[pose]
        for (const [name, gap] of gaps) {
          // A control's exclusive zone is its grown box cut at the midpoint to
          // its neighbour, so two centres `gap` apart give each at least
          // min(FLOOR, gap) of undisputed width.
          expect(
            Math.min(FLOOR, gap),
            `${name}: centres ${px(gap)} apart (arrows drawn ${px(width(previous.drawn))} wide)`,
          ).toBeGreaterThanOrEqual(floor)
        }
      })
    }
  }

  it('is load-bearing: the drawn controls alone are under the floor on a phone', () => {
    // If this ever passes without expansion the guard above has stopped
    // guarding anything — and the rects could be made drawn-size targets again.
    const scene = buildScene(VIEWPORTS[0]!, 'default')
    const back = measure(scene, 'back', BACK_RECT)
    expect(width(back.drawn)).toBeLessThan(FLOOR)
    expect(height(back.drawn)).toBeLessThan(FLOOR)
  })
})
