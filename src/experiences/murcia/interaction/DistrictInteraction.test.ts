// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { DistrictHighlight } from './DistrictHighlight'
import { createServicesDistrict } from '../district/createServicesDistrict'
import type { ServicesDistrict } from '../district/createServicesDistrict'
import { BUILDING_NODE_NAMES, PLAZA_NODE_NAME } from '../district/districtConfig'
import {
  BACK_RECT,
  DETAIL_RECT,
  DETAIL_VIEWPORT_RECT,
  NEXT_RECT,
  PREVIOUS_RECT,
} from '../district/display/displayConfig'
import type { DisplayRect } from '../district/display/displayConfig'
import { projectCoreRect } from '../district/display/displayProjection'
import { MIN_TOUCH_TARGET_CSS_PX, expandToMinimum } from '../../../interaction/touchTarget'
import type { ScreenBox } from '../../../interaction/touchTarget'
import { CameraRig } from '../camera/CameraRig'
import { DragPanController } from '../navigation/DragPanController'
import { murciaConfig } from '../config/murciaConfig'
import { resolveCameraPose } from '../config/environmentConfig'
import type { BoundsRect } from '../config/environmentConfig'
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings'
import type { DistrictContent } from '../../../content/types'
import type { CursorManager } from '../../../interaction/cursorManager'

// The real rig, controller, flight, highlight, state, flow and display — jsdom
// supplies the DOM, three supplies the maths. What is under test is the whole
// assembly's transition table, which the Node harness (checks/district-flight.ts)
// cannot reach because it never constructs the interaction itself.
//
// jsdom returns null from canvas.getContext('2d'), so the display paints no
// text. That is fine and deliberate: every assertion here is about geometry,
// state and hit testing, none of which the 2D context participates in.

const WIDTH = 1600
const HEIGHT = 900
const ASPECT = WIDTH / HEIGHT
const FOCUS = { x: -140, z: 420 }
const BOUNDS: BoundsRect = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }

const content: DistrictContent = {
  id: 'servicios',
  label: 'Servicios',
  summary: '',
  intro: '',
  services: [
    { id: 'a', title: 'Servicio A', body: 'Cuerpo A. Segunda frase de A que alarga el detalle.' },
    { id: 'b', title: 'Servicio B', body: 'Cuerpo B. Segunda frase de B que alarga el detalle.' },
    { id: 'c', title: 'Servicio C', body: 'Cuerpo C. Segunda frase de C que alarga el detalle.' },
  ],
}

const binding: DistrictSceneBinding = {
  contentId: 'servicios',
  approachYawDegrees: 45,
  focusDistanceScale: 0.78,
}

/**
 * A stand-in for the district's half of the city export: the three buildings
 * and the plaza they stand around, named exactly as the 2026-09-06 export names
 * them — including the plaza's authored `.001`, which is what the lookup has to
 * survive. Nothing else is in the cluster any more.
 */
function buildCity(): THREE.Object3D {
  const root = new THREE.Object3D()
  const add = (name: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
    mesh.name = name
    mesh.position.set(x, y, z)
    root.add(mesh)
  }

  BUILDING_NODE_NAMES.forEach((name, i) => {
    add(name, new THREE.BoxGeometry(10, 20, 10), FOCUS.x + (i - 1) * 30, 10, FOCUS.z)
  })

  // GLTFLoader strips the dot, so the runtime name is what a lookup has to find.
  add(
    PLAZA_NODE_NAME.replace('.', ''),
    new THREE.CylinderGeometry(40, 40, 1, 16),
    FOCUS.x,
    0,
    FOCUS.z,
  )

  root.updateWorldMatrix(true, true)
  return root
}

interface Fixture {
  district: ServicesDistrict
  rig: CameraRig
  camera: THREE.PerspectiveCamera
  controller: DragPanController
  canvas: HTMLCanvasElement
  container: HTMLElement
  scene: THREE.Scene
  panel: THREE.Mesh
  beginExternal: ReturnType<typeof vi.spyOn>
  onEngagedChange: ReturnType<typeof vi.fn>
  highlightState: () => string
  run: (seconds: number) => void
  /** Client coordinates of the building cluster's centre, through the live camera. */
  screenOf: () => { x: number; y: number }
  /** Client coordinates of the centre of a control's rect on the display. */
  controlPoint: (rect: DisplayRect) => { x: number; y: number }
  click: (x: number, y: number, options?: PointerOptions) => void
  drag: (
    from: { x: number; y: number },
    to: { x: number; y: number },
    options?: PointerOptions,
  ) => void
  /**
   * The halves of a gesture, separately.
   *
   * A browser does not promise that the canvas sees both. Pointer capture can
   * be released mid-gesture, after which the release is hit-tested like any
   * other event and lands on whatever is under the finger — so these exist to
   * model the sequences the paired helpers above cannot express.
   */
  press: (x: number, y: number, options?: PointerOptions) => void
  release: (x: number, y: number, options?: PointerOptions) => void
  /** A release that bubbles PAST the canvas rather than through it. */
  releaseOffCanvas: (x: number, y: number, options?: PointerOptions) => void
}

/**
 * How a gesture is delivered.
 *
 * `pointerType` defaults to the empty string these helpers have always sent,
 * which reads as a mouse everywhere it is tested — so every case written before
 * this option existed keeps the 6px threshold it was written against, and a
 * touch case has to ask for touch.
 */
interface PointerOptions {
  pointerType?: 'mouse' | 'touch'
  pointerId?: number
}

function makeFixture(): Fixture {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect
  // jsdom has no pointer capture; the controller calls all three.
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.hasPointerCapture = () => false
  container.appendChild(canvas)

  const env = murciaConfig
  const pose = resolveCameraPose(env, ASPECT)
  const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far)
  const rig = new CameraRig(camera, pose)
  rig.setAspect(ASPECT)
  rig.setFocus(FOCUS.x, FOCUS.z)
  camera.updateMatrixWorld(true)

  const controller = new DragPanController(canvas, camera, rig, env.navigation, BOUNDS, BOUNDS)
  const beginExternal = vi.spyOn(controller, 'beginExternalControl')

  const root = buildCity()

  const cursor = { request: vi.fn(), dispose: vi.fn() } as unknown as CursorManager
  const onEngagedChange = vi.fn()

  // Recorded rather than inspected: DistrictHighlight keeps its state private,
  // and the assertion that matters is what the cluster was told to be.
  //
  // ONE highlight since the 2026-09-06 export: the buildings light as a unit and
  // there is no per-service building left to light on its own. This used to key
  // the recording by instance so three could be told apart.
  let highlightCall = 'idle'
  const setStateSpy = vi
    .spyOn(DistrictHighlight.prototype, 'setState')
    .mockImplementation((state: 'idle' | 'hover' | 'active') => {
      highlightCall = state
    })

  const district = createServicesDistrict({
    root,
    container,
    canvas,
    camera,
    rig,
    controller,
    binding,
    content,
    cursor,
    groundPlaneHeight: env.navigation.groundPlaneHeight,
    getPose: () => rig.getEffectivePose(),
    getAspect: () => ASPECT,
    resolveBounds: () => BOUNDS,
    focusFlight: env.focusFlight,
    tapThresholdPx: {
      mouse: env.navigation.dragThresholdPx,
      touch: env.navigation.touchDragThresholdPx,
    },
    reducedMotion: true,
    onEngagedChange,
  })
  // Null means the fixture's city does not carry the cluster, which would make
  // every assertion below vacuous rather than failing.
  if (!district) throw new Error('the fixture city has no district cluster')

  const scene = new THREE.Scene()
  scene.add(district.object3D)

  // The panel is the assembly's only hit surface. Found by the uniform that
  // identifies it rather than by geometry type — the highlights own plane
  // markers too — and not threaded out of the factory, which has no reason to
  // expose it.
  let panel: THREE.Mesh | null = null
  district.object3D.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (panel || !mesh.isMesh) return
    const material = mesh.material as THREE.ShaderMaterial
    if (material?.uniforms?.['uCoreInset']) panel = mesh
  })
  if (!panel) throw new Error('no display panel in the district')
  const foundPanel: THREE.Mesh = panel

  const run = (seconds: number): void => {
    const dt = 1 / 60
    const frames = Math.max(1, Math.round(seconds / dt))
    for (let i = 0; i < frames; i += 1) {
      district.update(dt)
      controller.update(dt)
      camera.updateMatrixWorld(true)
      scene.updateMatrixWorld(true)
    }
  }

  const toClient = (world: THREE.Vector3): { x: number; y: number } => {
    const p = world.clone().project(camera)
    return { x: ((p.x + 1) / 2) * WIDTH, y: ((1 - p.y) / 2) * HEIGHT }
  }

  const screenOf = (): { x: number; y: number } => {
    camera.updateMatrixWorld(true)
    const point = district.screenPoint()
    if (!point) throw new Error('the district is not on screen in this fixture')
    return point
  }

  /**
   * Core-UV, top-down, back to a point in the world on the panel's face.
   *
   * The exact inverse of what `controlUnderPointer` does, so a mistake in either
   * shows up as a miss rather than as two mistakes cancelling: this goes
   * core -> uv -> local -> world, and the code under test goes back the other
   * way from a real raycast.
   */
  const controlPoint = (rect: DisplayRect): { x: number; y: number } => {
    const material = foundPanel.material as THREE.ShaderMaterial
    const inset = material.uniforms['uCoreInset'].value as number
    const geometry = foundPanel.geometry as THREE.PlaneGeometry
    const width = geometry.parameters.width
    const height = geometry.parameters.height

    const coreX = rect.x + rect.width / 2
    const coreYTopDown = rect.y + rect.height / 2
    const uvX = (coreX - 0.5) * inset + 0.5
    const uvY = 1 - ((coreYTopDown - 0.5) * inset + 0.5)

    const local = new THREE.Vector3((uvX - 0.5) * width, (uvY - 0.5) * height, 0)
    scene.updateMatrixWorld(true)
    return toClient(foundPanel.localToWorld(local))
  }

  const pointerInit = (x: number, y: number, options: PointerOptions = {}): PointerEventInit => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? '',
    bubbles: true,
  })

  const press = (x: number, y: number, options?: PointerOptions): void => {
    canvas.dispatchEvent(new PointerEvent('pointerdown', pointerInit(x, y, options)))
  }

  const release = (x: number, y: number, options?: PointerOptions): void => {
    canvas.dispatchEvent(new PointerEvent('pointerup', pointerInit(x, y, options)))
  }

  /**
   * A release that lands on the page rather than on the canvas.
   *
   * `container` is the canvas's PARENT, so this bubbles to `document` and to
   * `window` without ever passing through the canvas's own listeners — which is
   * what a finger lifting over the site header does once the drag controller
   * has released its pointer capture.
   */
  const releaseOffCanvas = (x: number, y: number, options?: PointerOptions): void => {
    container.dispatchEvent(new PointerEvent('pointerup', pointerInit(x, y, options)))
  }

  const click = (x: number, y: number, options?: PointerOptions): void => {
    press(x, y, options)
    release(x, y, options)
  }

  const drag = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    options?: PointerOptions,
  ): void => {
    press(from.x, from.y, options)
    canvas.dispatchEvent(new PointerEvent('pointermove', pointerInit(to.x, to.y, options)))
    release(to.x, to.y, options)
  }

  return {
    district,
    rig,
    camera,
    controller,
    canvas,
    container,
    scene,
    panel: foundPanel,
    beginExternal,
    onEngagedChange,
    highlightState: () => highlightCall,
    run,
    screenOf,
    controlPoint,
    click,
    drag,
    press,
    release,
    releaseOffCanvas,
    // Restored by the suite's afterEach.
    ...({ setStateSpy } as unknown as Record<string, never>),
  }
}

/** Enters the district and lets the entry flight settle. */
function enter(f: Fixture): void {
  f.click(f.screenOf().x, f.screenOf().y)
  f.run(2)
}

/** The eyebrow the display was last given, as a proxy for "which service". */
function activeTitle(f: Fixture): string {
  // The display keeps its content private; the a11y live region is fed from the
  // same resolved content in the same subscription, so it is the observable.
  return f.container.querySelector('.district-a11y-live')?.textContent ?? ''
}

describe('the services district', () => {
  let f: Fixture

  beforeEach(() => {
    f = makeFixture()
    f.run(1 / 60)
  })

  afterEach(() => {
    f.district.dispose()
    f.container.remove()
    vi.restoreAllMocks()
  })

  it('starts closed, with nothing engaged', () => {
    expect(f.district.isEngaged).toBe(false)
    expect(activeTitle(f)).toBe('')
  })

  it('opens on the first service from a tap on any building, and takes the rig', () => {
    f.click(f.screenOf().x, f.screenOf().y)
    expect(f.district.isEngaged).toBe(true)
    expect(f.onEngagedChange).toHaveBeenCalledTimes(1)
    expect(f.beginExternal).toHaveBeenCalledTimes(1)
    // Building c, but service A: the buildings are one entry target and carry
    // no service meaning (plan 003 §6).
    expect(activeTitle(f)).toContain('Servicio A')
    expect(activeTitle(f)).toContain('01 / 03')
  })

  it('lights the active building and leaves the others at idle', () => {
    enter(f)
    expect(f.highlightState()).toBe('active')
  })

  it('pages forward and back through the services from the display', () => {
    enter(f)

    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    expect(activeTitle(f)).toContain('Servicio B')
    // The cluster does not follow the active index — paging moves the display,
    // not the world (plan 003 §6). It stays lit for as long as the district is.
    expect(f.highlightState()).toBe('active')

    f.click(f.controlPoint(PREVIOUS_RECT).x, f.controlPoint(PREVIOUS_RECT).y)
    expect(activeTitle(f)).toContain('Servicio A')
    expect(f.highlightState()).toBe('active')
  })

  it('wraps in both directions', () => {
    enter(f)
    const next = f.controlPoint(NEXT_RECT)
    const previous = f.controlPoint(PREVIOUS_RECT)

    f.click(next.x, next.y)
    f.click(next.x, next.y)
    expect(activeTitle(f)).toContain('Servicio C')
    f.click(next.x, next.y)
    expect(activeTitle(f)).toContain('Servicio A')

    f.click(previous.x, previous.y)
    expect(activeTitle(f)).toContain('Servicio C')
  })

  it('opens the detail and closes it again from the same corner', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    expect(f.container.querySelector('.district-a11y-live')?.textContent).toContain('saber más')

    // In detail mode the top-left control means "close", not "leave".
    f.click(f.controlPoint(BACK_RECT).x, f.controlPoint(BACK_RECT).y)
    expect(f.district.isEngaged).toBe(true)
    expect(activeTitle(f)).toContain('Cuerpo A.')
  })

  // Plan 003 §11. The summary's control bar sits inside the reading viewport,
  // so while the detail is open those pixels scroll the copy instead of paging.
  // Asserted through a real raycast rather than through `controlAt` alone,
  // because the thing that could break it is the UV mapping, not the rects.
  it('does not page while reading — the control bar belongs to the copy', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    const reading = activeTitle(f)

    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    expect(activeTitle(f)).toBe(reading)
    expect(activeTitle(f)).toContain('Servicio A')
  })

  it('pages again once the detail is closed', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    f.click(f.controlPoint(BACK_RECT).x, f.controlPoint(BACK_RECT).y)

    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    expect(activeTitle(f)).toContain('Servicio B')
    expect(activeTitle(f)).toContain('Cuerpo B.')
  })

  it('leaves the district from VOLVER and returns the dolly', () => {
    enter(f)
    expect(f.rig.getDistanceScale()).toBeLessThan(1)

    f.click(f.controlPoint(BACK_RECT).x, f.controlPoint(BACK_RECT).y)
    expect(f.district.isEngaged).toBe(false)
    f.run(2)
    expect(f.rig.getDistanceScale()).toBeCloseTo(1, 5)
    expect(f.highlightState()).toBe('idle')
  })

  it('re-enters on the first service after leaving on another', () => {
    enter(f)
    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    f.click(f.controlPoint(BACK_RECT).x, f.controlPoint(BACK_RECT).y)
    f.run(2)

    enter(f)
    expect(activeTitle(f)).toContain('Servicio A')
  })

  // The behaviour plan 003 retired. A building is scenery once the district is
  // open, and a stray tap on one must not page the display or fly the camera.
  it('ignores taps on buildings once the district is open', () => {
    enter(f)
    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    expect(activeTitle(f)).toContain('Servicio B')

    const flightsBefore = f.beginExternal.mock.calls.length
    f.click(f.screenOf().x, f.screenOf().y)
    expect(activeTitle(f)).toContain('Servicio B')
    expect(f.beginExternal.mock.calls.length).toBe(flightsBefore)
  })

  it('does not enter on the release of a drag that ends over a building', () => {
    const at = f.screenOf()
    f.drag({ x: at.x - 120, y: at.y - 40 }, at)
    expect(f.district.isEngaged).toBe(false)
  })

  it('closes the detail first and the district second on Escape', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(f.district.isEngaged).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(f.district.isEngaged).toBe(false)
  })

  it('stops responding to the canvas once disabled', () => {
    f.district.setEnabled(false)
    f.click(f.screenOf().x, f.screenOf().y)
    expect(f.district.isEngaged).toBe(false)
  })

  // ── The press ledger, and the ways a browser ends a gesture without saying so ──
  //
  // Reported 2026-09-06, mobile only: taps on the district stop working, either
  // from the first one or after a single successful open. Every case below is a
  // different route to the same latch — a recorded press whose release the canvas
  // never sees while enabled — which is why the reports share no common steps.

  describe('touch targets — a finger is given more than the drawn glyph', () => {
    /** Where a control is drawn on this fixture's screen, through the live matrices. */
    const drawn = (rect: DisplayRect): ScreenBox => {
      f.scene.updateMatrixWorld(true)
      const box = projectCoreRect(rect, f.panel, f.camera, {
        left: 0,
        top: 0,
        width: WIDTH,
        height: HEIGHT,
      })
      if (!box) throw new Error('the control is behind the camera in this fixture')
      return box
    }

    it('draws the close under the floor, which is why the floor exists', () => {
      enter(f)
      const box = drawn(BACK_RECT)
      expect(box.right - box.left).toBeLessThan(MIN_TOUCH_TARGET_CSS_PX)
    })

    it('leaves the district from a touch beside the close glyph, inside its grown box', () => {
      enter(f)
      const box = drawn(BACK_RECT)
      const grown = expandToMinimum(box)
      const x = grown.right - 2
      const y = (box.top + box.bottom) / 2
      // Genuinely off the drawn glyph, not on its edge.
      expect(x).toBeGreaterThan(box.right + 4)
      f.click(x, y, { pointerType: 'touch' })
      expect(f.district.isEngaged).toBe(false)
    })

    it('gives a mouse the drawn glyph and nothing more', () => {
      enter(f)
      const box = drawn(BACK_RECT)
      const grown = expandToMinimum(box)
      f.click(grown.right - 2, (box.top + box.bottom) / 2, { pointerType: 'mouse' })
      expect(f.district.isEngaged).toBe(true)
    })

    it('pages from a touch beside an arrow, to the arrow it is nearest', () => {
      enter(f)
      const box = drawn(PREVIOUS_RECT)
      const grown = expandToMinimum(box)
      f.click(grown.right - 2, (box.top + box.bottom) / 2, { pointerType: 'touch' })
      expect(activeTitle(f)).toContain('Servicio C')
    })

    it('activates the control the finger landed on, though it lifted a few pixels off it', () => {
      enter(f)
      const box = drawn(BACK_RECT)
      const cx = (box.left + box.right) / 2
      const cy = (box.top + box.bottom) / 2
      f.press(cx, cy, { pointerType: 'touch' })
      // Inside the touch tap tolerance, outside the drawn glyph.
      f.release(cx + 9, cy + 5, { pointerType: 'touch' })
      expect(f.district.isEngaged).toBe(false)
    })

    it('does not grow the reading surface, so the close stays reachable while reading', () => {
      enter(f)
      f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
      const box = drawn(BACK_RECT)
      const grown = expandToMinimum(box)
      // Below the glyph, where the viewport rect begins: a finger here is
      // nearer the close than it is on the copy.
      f.click((box.left + box.right) / 2, grown.bottom - 2, { pointerType: 'touch' })
      // Closed the detail rather than scrolled it: still in the district, back
      // on the summary — the same observable the mouse's close test uses.
      expect(f.district.isEngaged).toBe(true)
      expect(activeTitle(f)).toContain('Cuerpo A.')
    })
  })

  it('opens on a touch tap, measured against the touch threshold', () => {
    f.click(f.screenOf().x, f.screenOf().y, { pointerType: 'touch' })
    expect(f.district.isEngaged).toBe(true)
  })

  it('still opens after a gesture that was disabled between press and release', () => {
    // The scene swap out of Murcia is driven by a PINCH on mobile, so the
    // fingers are still on the glass when MurciaExperience.setActive(false)
    // disables this district. Their release then arrives to a deaf listener.
    const at = f.screenOf()
    f.press(at.x, at.y, { pointerType: 'touch', pointerId: 5 })
    f.district.setEnabled(false)
    f.release(at.x, at.y, { pointerType: 'touch', pointerId: 5 })
    f.district.setEnabled(true)

    f.click(at.x, at.y, { pointerType: 'touch', pointerId: 6 })
    expect(f.district.isEngaged).toBe(true)
  })

  it('still opens after a detail drag whose release lands off the canvas', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    f.run(1)

    // Claiming the reading gesture calls beginExternalControl, which releases
    // the drag controller's pointer capture. From there the release is
    // hit-tested like any other event, and the site header takes it.
    const at = f.controlPoint(DETAIL_VIEWPORT_RECT)
    f.press(at.x, at.y + 60, { pointerType: 'touch', pointerId: 9 })
    f.releaseOffCanvas(at.x, at.y - 200, { pointerType: 'touch', pointerId: 9 })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    f.run(2)
    expect(f.district.isEngaged).toBe(false)

    f.click(f.screenOf().x, f.screenOf().y, { pointerType: 'touch', pointerId: 10 })
    expect(f.district.isEngaged).toBe(true)
  })

  it('hands the rig back when a detail drag ends off the canvas', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    f.run(1)

    const at = f.controlPoint(DETAIL_VIEWPORT_RECT)
    f.press(at.x, at.y + 60, { pointerType: 'touch', pointerId: 11 })
    expect(f.controller.isExternallyControlled).toBe(true)

    f.releaseOffCanvas(at.x, at.y - 200, { pointerType: 'touch', pointerId: 11 })
    // Nothing else is going to hand it back: the flight settled long ago, so
    // the reading gesture is the only owner left holding it.
    expect(f.controller.isExternallyControlled).toBe(false)
  })

  it('reaches every transition from the keyboard alone', () => {
    const controls = f.container.querySelectorAll<HTMLButtonElement>('.district-a11y-control')
    expect(controls.length).toBe(5)

    const byLabel = (text: string): HTMLButtonElement => {
      const found = Array.from(controls).find((c) => c.textContent?.includes(text))
      if (!found) throw new Error(`no control matching "${text}"`)
      return found
    }

    byLabel('explorar').click()
    f.run(2)
    expect(f.district.isEngaged).toBe(true)
    expect(activeTitle(f)).toContain('Servicio A')

    byLabel('siguiente').click()
    expect(activeTitle(f)).toContain('Servicio B')

    byLabel('volver').click()
    expect(f.district.isEngaged).toBe(false)
  })

  it('withdraws the pagination controls from the tab order while reading', () => {
    enter(f)
    const hiddenLabels = () =>
      Array.from(f.container.querySelectorAll<HTMLButtonElement>('.district-a11y-control'))
        .filter((c) => c.hidden)
        .map((c) => c.textContent)

    expect(hiddenLabels()).toEqual(['Servicios: explorar'])

    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    expect(hiddenLabels()).toContain('Servicio anterior')
    expect(hiddenLabels()).toContain('Servicio siguiente')
  })

  it('claims the rig while a detail drag scrolls, and hands it back', () => {
    enter(f)
    f.click(f.controlPoint(DETAIL_RECT).x, f.controlPoint(DETAIL_RECT).y)
    f.run(1)

    const endExternal = vi.spyOn(f.controller, 'endExternalControl')
    const before = f.beginExternal.mock.calls.length
    const at = f.controlPoint(DETAIL_VIEWPORT_RECT)
    f.drag({ x: at.x, y: at.y + 60 }, { x: at.x, y: at.y - 60 })

    expect(f.beginExternal.mock.calls.length).toBe(before + 1)
    expect(endExternal).toHaveBeenCalledWith({ adoptRigState: true })
    // The reading gesture is not also a tap on whatever it ended over.
    expect(f.district.isEngaged).toBe(true)
  })
})
