// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { DistrictInteraction } from './DistrictInteraction'
import type { ServiceSiteInput } from './DistrictInteraction'
import { resolveDistrict } from './resolveDistrict'
import { CameraRig } from '../camera/CameraRig'
import { DragPanController } from '../navigation/DragPanController'
import { murciaConfig } from '../config/murciaConfig'
import { resolveCameraPose } from '../config/environmentConfig'
import type { BoundsRect } from '../config/environmentConfig'
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings'
import type { DistrictContent } from '../../../content/types'
import type { CursorManager } from '../../../interaction/cursorManager'

// The real rig, controller, flight, highlight, panel and label — jsdom supplies
// the DOM, three supplies the maths. What is under test is the transition
// table of ONE interaction owning several buildings, which the Node harness
// (checks/district-flight.ts) cannot reach because it never constructs the
// interaction itself.

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
    { id: 'a', title: 'Servicio A', body: 'Cuerpo A.' },
    { id: 'b', title: 'Servicio B', body: 'Cuerpo B.' },
    { id: 'c', title: 'Servicio C', body: 'Cuerpo C.' },
  ],
}

const binding: DistrictSceneBinding = {
  contentId: 'servicios',
  approachYawDegrees: -35,
  focusDistanceScale: 0.78,
  buildings: [
    { serviceId: 'a', nodeName: 'edificio-a' },
    { serviceId: 'b', nodeName: 'edificio-b' },
    { serviceId: 'c', nodeName: 'edificio-c' },
  ],
}

/** Three 10x20x10 boxes, 30 m apart on X, around the initial focus. */
function buildCity(): THREE.Object3D {
  const root = new THREE.Object3D()
  const positions: Array<[string, number]> = [
    ['edificio-a', FOCUS.x - 30],
    ['edificio-b', FOCUS.x],
    ['edificio-c', FOCUS.x + 30],
  ]
  for (const [name, x] of positions) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 10), new THREE.MeshStandardMaterial())
    mesh.name = name
    mesh.position.set(x, 10, FOCUS.z)
    root.add(mesh)
  }
  root.updateWorldMatrix(true, true)
  return root
}

interface Fixture {
  interaction: DistrictInteraction
  rig: CameraRig
  camera: THREE.PerspectiveCamera
  controller: DragPanController
  canvas: HTMLCanvasElement
  container: HTMLElement
  sites: ServiceSiteInput[]
  beginExternal: ReturnType<typeof vi.spyOn>
  onEngagedChange: ReturnType<typeof vi.fn>
  /** Advance frames. */
  run: (seconds: number) => void
  /** Client coordinates of a building's centre, through the live camera. */
  screenOf: (serviceId: string) => { x: number; y: number }
  click: (x: number, y: number) => void
}

function makeFixture(options: { reducedMotion?: boolean } = {}): Fixture {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON() {} }) as DOMRect
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

  const interaction = new DistrictInteraction({
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
    tapThresholdPx: { mouse: env.navigation.dragThresholdPx, touch: env.navigation.touchDragThresholdPx },
    reducedMotion: options.reducedMotion ?? true,
    onEngagedChange,
  })

  const run = (seconds: number): void => {
    const dt = 1 / 60
    const frames = Math.max(1, Math.round(seconds / dt))
    for (let i = 0; i < frames; i += 1) {
      interaction.update(dt)
      controller.update(dt)
      camera.updateMatrixWorld(true)
    }
  }

  const screenOf = (serviceId: string): { x: number; y: number } => {
    const site = sites.find((s) => s.service.id === serviceId)!
    camera.updateMatrixWorld(true)
    const p = site.lookup.center.clone().project(camera)
    return { x: ((p.x + 1) / 2) * WIDTH, y: ((1 - p.y) / 2) * HEIGHT }
  }

  const click = (x: number, y: number): void => {
    const init = { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', init))
    canvas.dispatchEvent(new PointerEvent('pointerup', init))
  }

  return {
    interaction,
    rig,
    camera,
    controller,
    canvas,
    container,
    sites,
    beginExternal,
    onEngagedChange,
    run,
    screenOf,
    click,
  }
}

describe('DistrictInteraction with several service buildings', () => {
  let f: Fixture

  beforeEach(() => {
    f = makeFixture()
    // One frame so labels are positioned and the camera matrix is current.
    f.run(1 / 60)
  })

  afterEach(() => {
    f.interaction.dispose()
    f.container.remove()
  })

  it('exposes the sites in tour order and starts idle', () => {
    expect(f.interaction.serviceIds).toEqual(['a', 'b', 'c'])
    expect(f.interaction.getState()).toEqual({ type: 'idle' })
    expect(f.interaction.isEngaged).toBe(false)
  })

  it('clicking a building focuses it, opens the panel and takes the rig', () => {
    const at = f.screenOf('b')
    f.click(at.x, at.y)
    expect(f.interaction.getState()).toEqual({ type: 'focusing', serviceId: 'b' })
    expect(f.interaction.isEngaged).toBe(true)
    expect(f.onEngagedChange).toHaveBeenCalledTimes(1)
    expect(f.beginExternal).toHaveBeenCalledTimes(1)
    expect(f.container.querySelector('h2')?.textContent).toBe('Servicio B')
    expect(f.container.querySelector('.district-panel-eyebrow')?.textContent).toBe('Servicios · 2 / 3')

    f.run(3)
    expect(f.interaction.getState()).toEqual({ type: 'open', serviceId: 'b' })
    expect(f.rig.getDistanceScale()).toBeCloseTo(0.78, 6)
  })

  it('selecting the open building again is a no-op', () => {
    const at = f.screenOf('b')
    f.click(at.x, at.y)
    f.run(3)
    f.beginExternal.mockClear()
    const again = f.screenOf('b')
    f.click(again.x, again.y)
    expect(f.beginExternal).not.toHaveBeenCalled()
    expect(f.interaction.getState()).toEqual({ type: 'open', serviceId: 'b' })
  })

  it('stepping swaps the panel, re-aims the flight and never resets the distance', () => {
    const at = f.screenOf('a')
    f.click(at.x, at.y)
    f.run(3)
    expect(f.interaction.getState()).toEqual({ type: 'open', serviceId: 'a' })
    const panel = f.container.querySelector<HTMLElement>('.district-panel')!
    const next = panel.querySelector<HTMLButtonElement>('[data-step="1"]')!
    next.focus()
    f.onEngagedChange.mockClear()

    next.click()
    expect(f.interaction.getState()).toEqual({ type: 'focusing', serviceId: 'b' })
    // Still engaged throughout: the rail must not flicker on a swap.
    expect(f.onEngagedChange).not.toHaveBeenCalled()
    expect(panel.hidden).toBe(false)
    expect(document.activeElement).toBe(next)
    expect(f.container.querySelector('h2')?.textContent).toBe('Servicio B')

    // Distance stays at the approach scale for the whole swap flight.
    let minScale = Infinity
    for (let i = 0; i < 180; i += 1) {
      f.run(1 / 60)
      minScale = Math.min(minScale, f.rig.getDistanceScale())
    }
    expect(minScale).toBeGreaterThanOrEqual(0.78 - 1e-6)
    expect(f.rig.getDistanceScale()).toBeCloseTo(0.78, 6)
    expect(f.interaction.getState()).toEqual({ type: 'open', serviceId: 'b' })
  })

  it('prev from the first building wraps to the last', () => {
    const at = f.screenOf('a')
    f.click(at.x, at.y)
    f.run(3)
    f.container.querySelector<HTMLButtonElement>('[data-step="-1"]')!.click()
    expect(f.interaction.getState()).toEqual({ type: 'focusing', serviceId: 'c' })
    expect(f.container.querySelector('.district-panel-eyebrow')?.textContent).toBe('Servicios · 3 / 3')
  })

  it('a swap mid-flight re-aims without a second external-control handover fight', () => {
    // Reduced motion collapses the flight to a frame; this one needs a real one.
    f.interaction.dispose()
    f.container.remove()
    f = makeFixture({ reducedMotion: false })
    f.run(1 / 60)
    const at = f.screenOf('a')
    f.click(at.x, at.y)
    f.run(0.2)
    expect(f.interaction.isFlying).toBe(true)
    f.container.querySelector<HTMLButtonElement>('[data-step="1"]')!.click()
    expect(f.interaction.getState()).toEqual({ type: 'focusing', serviceId: 'b' })
    f.run(3)
    expect(f.interaction.getState()).toEqual({ type: 'open', serviceId: 'b' })
    expect(f.interaction.isFlying).toBe(false)
  })

  it('clicking empty ground while open closes and flies the distance back to 1', () => {
    const at = f.screenOf('b')
    f.click(at.x, at.y)
    f.run(3)
    // Far corner of the canvas, on the near-foreground ground.
    f.click(20, HEIGHT - 20)
    expect(f.interaction.getState()).toEqual({ type: 'idle' })
    expect(f.interaction.isEngaged).toBe(false)
    expect(f.container.querySelector<HTMLElement>('.district-panel')!.hidden).toBe(true)
    f.run(3)
    expect(f.rig.getDistanceScale()).toBeCloseTo(1, 6)
  })

  it('Escape closes from the window', () => {
    const at = f.screenOf('c')
    f.click(at.x, at.y)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(f.interaction.getState()).toEqual({ type: 'idle' })
  })

  it('the projected label activates its own building', () => {
    const labels = f.container.querySelectorAll<HTMLButtonElement>('.district-label')
    expect(labels.length).toBe(3)
    expect(labels[2]?.getAttribute('aria-label')).toBe('Servicio C — ver servicio')
    labels[2]!.click()
    expect(f.interaction.getState()).toEqual({ type: 'focusing', serviceId: 'c' })
  })

  it('hover moves from one building to the next in a single frame', () => {
    const a = f.screenOf('a')
    f.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: a.x, clientY: a.y, bubbles: true }))
    f.run(1 / 60)
    expect(f.interaction.getState()).toEqual({ type: 'hovering', serviceId: 'a' })

    const b = f.screenOf('b')
    f.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }))
    f.run(1 / 60)
    expect(f.interaction.getState()).toEqual({ type: 'hovering', serviceId: 'b' })
    const labels = f.container.querySelectorAll<HTMLButtonElement>('.district-label')
    expect(labels[0]?.classList.contains('shown')).toBe(false)
    expect(labels[1]?.classList.contains('shown')).toBe(true)

    f.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: HEIGHT - 20, bubbles: true }))
    f.run(1 / 60)
    expect(f.interaction.getState()).toEqual({ type: 'idle' })
    // Hovering never counts as engagement.
    expect(f.onEngagedChange).not.toHaveBeenCalled()
  })

  it('a drag that ends over a building is not a tap on it', () => {
    const b = f.screenOf('b')
    const init = { button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true }
    f.canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: b.x - 200, clientY: b.y + 100 }))
    for (let i = 1; i <= 10; i += 1) {
      f.canvas.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: b.x - 200 + 20 * i, clientY: b.y + 100 - 10 * i }))
      f.run(1 / 60)
    }
    // The controller must have seen a real drag, or this test proves nothing.
    expect(f.controller.isDragging).toBe(true)
    f.canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: b.x, clientY: b.y }))
    f.run(0.5)
    expect(f.interaction.isEngaged).toBe(false)
  })

  it('a drag the controller lost is still not a tap', () => {
    const b = f.screenOf('b')
    const init = { button: 0, pointerId: 7, bubbles: true }
    f.canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: b.x - 150, clientY: b.y + 80 }))
    f.canvas.dispatchEvent(new PointerEvent('pointercancel', { ...init, clientX: b.x - 100, clientY: b.y + 40 }))
    f.canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: b.x - 150, clientY: b.y + 80 }))
    f.canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: b.x, clientY: b.y }))
    f.run(0.2)
    expect(f.interaction.isEngaged).toBe(false)
  })

  it('ignores input while disabled', () => {
    f.interaction.setEnabled(false)
    const at = f.screenOf('b')
    f.click(at.x, at.y)
    expect(f.interaction.getState()).toEqual({ type: 'idle' })
  })
})
