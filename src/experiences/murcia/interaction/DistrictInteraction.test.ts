// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { resolveDistrict } from './resolveDistrict'
import { DistrictHighlight } from './DistrictHighlight'
import type { ServiceSiteInput } from './DistrictInteraction'
import { createServicesDistrict } from '../district/createServicesDistrict'
import type { ServicesDistrict } from '../district/createServicesDistrict'
import {
  BACK_RECT,
  DETAIL_RECT,
  DETAIL_VIEWPORT_RECT,
  NEXT_RECT,
  PREVIOUS_RECT,
} from '../district/display/displayConfig'
import type { DisplayRect } from '../district/display/displayConfig'
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
  buildings: [
    {
      serviceId: 'a',
      nodeName: 'Edificios-servicios-001',
      connectionNodeName: 'Edificios-servicios-conneccion-001',
      accent: 0x06dbbe,
    },
    {
      serviceId: 'b',
      nodeName: 'Edificios-servicios-002',
      connectionNodeName: 'Edificios-servicios-conneccion-002',
      accent: 0x5fb800,
    },
    {
      serviceId: 'c',
      nodeName: 'Edificios-servicios-003',
      connectionNodeName: 'Edificios-servicios-conneccion-003',
      accent: 0xeb7500,
    },
  ],
}

/**
 * A stand-in for the district's half of the city export: three buildings 30 m
 * apart, the plaza they surround, the ring, their connections and three focos.
 * Named exactly as the export names them, so the lookups under test are the
 * real ones.
 */
function buildCity(): THREE.Object3D {
  const root = new THREE.Object3D()
  const add = (name: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
    mesh.name = name
    mesh.position.set(x, y, z)
    root.add(mesh)
  }

  binding.buildings.forEach((b, i) => {
    const x = FOCUS.x + (i - 1) * 30
    add(b.nodeName, new THREE.BoxGeometry(10, 20, 10), x, 10, FOCUS.z)
    add(b.connectionNodeName, new THREE.BoxGeometry(4, 1, 20), x, 1, FOCUS.z - 12)
  })

  add('Edificios-servicios-plaza', new THREE.CylinderGeometry(40, 40, 1, 16), FOCUS.x, 0, FOCUS.z)
  add(
    'Edificios-servicios-anillo-shader-interior',
    new THREE.TorusGeometry(30, 1, 8, 24),
    FOCUS.x,
    1,
    FOCUS.z,
  )
  for (let i = 1; i <= 3; i += 1) {
    add(`Edificios-servicios-foco-00${i}`, new THREE.BoxGeometry(2, 4, 2), FOCUS.x + i * 8, 2, FOCUS.z + 20)
  }

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
  highlightStates: () => string[]
  run: (seconds: number) => void
  /** Client coordinates of a building's centre, through the live camera. */
  screenOf: (serviceId: string) => { x: number; y: number }
  /** Client coordinates of the centre of a control's rect on the display. */
  controlPoint: (rect: DisplayRect) => { x: number; y: number }
  click: (x: number, y: number) => void
  drag: (from: { x: number; y: number }, to: { x: number; y: number }) => void
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

  const controller = new DragPanController(canvas, camera, rig, env.navigation, BOUNDS)
  const beginExternal = vi.spyOn(controller, 'beginExternalControl')

  const root = buildCity()
  const sites: ServiceSiteInput[] = content.services.map((service) => {
    const building = binding.buildings.find((b) => b.serviceId === service.id)!
    return {
      service,
      binding: building,
      lookup: resolveDistrict(root, {
        id: service.id,
        tag: '',
        nodeNames: [building.nodeName],
        allowSpatialFallback: false,
      }),
    }
  })

  const cursor = { request: vi.fn(), dispose: vi.fn() } as unknown as CursorManager
  const onEngagedChange = vi.fn()

  // Recorded rather than inspected: DistrictHighlight keeps its state private,
  // and the assertion that matters is which building was told to be active.
  const highlightCalls: string[] = ['idle', 'idle', 'idle']
  const highlightInstances: DistrictHighlight[] = []
  const setStateSpy = vi
    .spyOn(DistrictHighlight.prototype, 'setState')
    .mockImplementation(function (this: DistrictHighlight, state: 'idle' | 'hover' | 'active') {
      let index = highlightInstances.indexOf(this)
      if (index === -1) {
        index = highlightInstances.length
        highlightInstances.push(this)
      }
      highlightCalls[index] = state
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
    sites,
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

  const screenOf = (serviceId: string): { x: number; y: number } => {
    const site = sites.find((s) => s.service.id === serviceId)!
    camera.updateMatrixWorld(true)
    return toClient(site.lookup.center)
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

  const click = (x: number, y: number): void => {
    const init = { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', init))
    canvas.dispatchEvent(new PointerEvent('pointerup', init))
  }

  const drag = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const base = { button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: from.x, clientY: from.y }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: to.x, clientY: to.y }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: to.x, clientY: to.y }))
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
    highlightStates: () => [...highlightCalls],
    run,
    screenOf,
    controlPoint,
    click,
    drag,
    // Restored by the suite's afterEach.
    ...({ setStateSpy } as unknown as Record<string, never>),
  }
}

/** Enters the district and lets the entry flight settle. */
function enter(f: Fixture): void {
  f.click(f.screenOf('a').x, f.screenOf('a').y)
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
    f.click(f.screenOf('c').x, f.screenOf('c').y)
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
    expect(f.highlightStates()).toEqual(['active', 'idle', 'idle'])
  })

  it('pages forward and back through the services from the display', () => {
    enter(f)

    f.click(f.controlPoint(NEXT_RECT).x, f.controlPoint(NEXT_RECT).y)
    expect(activeTitle(f)).toContain('Servicio B')
    expect(f.highlightStates()).toEqual(['idle', 'active', 'idle'])

    f.click(f.controlPoint(PREVIOUS_RECT).x, f.controlPoint(PREVIOUS_RECT).y)
    expect(activeTitle(f)).toContain('Servicio A')
    expect(f.highlightStates()).toEqual(['active', 'idle', 'idle'])
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
    expect(f.highlightStates()).toEqual(['idle', 'idle', 'idle'])
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
    f.click(f.screenOf('c').x, f.screenOf('c').y)
    expect(activeTitle(f)).toContain('Servicio B')
    expect(f.beginExternal.mock.calls.length).toBe(flightsBefore)
  })

  it('does not enter on the release of a drag that ends over a building', () => {
    const at = f.screenOf('b')
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
    f.click(f.screenOf('a').x, f.screenOf('a').y)
    expect(f.district.isEngaged).toBe(false)
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
