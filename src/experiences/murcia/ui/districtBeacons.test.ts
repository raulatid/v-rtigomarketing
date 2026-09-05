// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BEACON_ARM_DELAY_MS, BEACON_DWELL_MS, DistrictBeacons } from './districtBeacons'

const RECT = { left: 0, top: 0, width: 800, height: 600 }

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, RECT.width / RECT.height, 0.1, 1000)
  cam.updateMatrixWorld(true)
  return cam
}

/** Straight ahead of the camera above, so it projects to the middle. */
const AHEAD = new THREE.Vector3(0, 0, -10)
/** Behind it, which is the "cannot be pinned to" case. */
const BEHIND = new THREE.Vector3(0, 0, 10)

let host: HTMLDivElement
let beacons: DistrictBeacons
let servicesAt: THREE.Vector3

function setup(): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  servicesAt = AHEAD.clone()
  beacons = new DistrictBeacons(host, [
    { id: 'servicios', anchor: (out) => out.copy(servicesAt), label: 'Servicios', caption: 'Lo que hacemos' },
    { id: 'blog', anchor: (out) => out.copy(AHEAD), label: 'Blog', caption: 'Lo que pensamos' },
  ])
}

const layer = () => host.querySelector<HTMLElement>('.district-beacons')!
const pin = (id: string) => host.querySelector<HTMLElement>(`[data-beacon="${id}"]`)!

beforeEach(() => {
  vi.useFakeTimers()
  setup()
})

afterEach(() => {
  beacons.dispose()
  host.remove()
  vi.useRealTimers()
})

describe('the arrival beacons', () => {
  it('names each place and what it holds', () => {
    expect(pin('servicios').textContent).toContain('Servicios')
    expect(pin('servicios').textContent).toContain('Lo que hacemos')
    expect(pin('blog').textContent).toContain('Blog')
    expect(pin('blog').textContent).toContain('Lo que pensamos')
  })

  it('is decoration, and says so', () => {
    // `DistrictA11y` is the real keyboard route into every service. A second,
    // navigationally useless copy in the accessibility tree would be read out
    // over the top of it.
    expect(layer().getAttribute('aria-hidden')).toBe('true')
  })

  it('shows nothing until it is armed', () => {
    expect(layer().dataset.visible).toBeUndefined()
  })

  it('waits a beat after arming before it appears', () => {
    beacons.arm()
    expect(layer().dataset.visible, 'shown before the arrival had landed').toBeUndefined()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    expect(layer().dataset.visible).toBe('true')
  })

  it('ignores an interaction that lands inside the arm window', () => {
    // THE defect this whole two-stage arm exists for. The gesture that carries
    // a viewer into Murcia keeps producing pointer events after the arrival,
    // and taking those as "the viewer is exploring" is how `#controls-hint`
    // came to be at opacity 0 in every run of the mobile audit — dismissed by
    // the very gesture that brought the viewer to it, before it was ever seen.
    beacons.arm()
    beacons.dismiss()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    expect(layer().dataset.visible, 'the arriving gesture dismissed them').toBe('true')
  })

  it('retires once the viewer starts exploring', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    beacons.dismiss()
    expect(layer().dataset.visible).toBeUndefined()
    expect(beacons.isShowing).toBe(false)
  })

  it('retires on its own if nobody touches anything', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    expect(beacons.isShowing).toBe(true)
    vi.advanceTimersByTime(BEACON_DWELL_MS - 1)
    expect(beacons.isShowing, 'left before the dwell was up').toBe(true)
    vi.advanceTimersByTime(1)
    expect(beacons.isShowing).toBe(false)
  })

  it('is offered again on the next arrival', () => {
    // Unlike the controls pill, which latches for the whole page load. A viewer
    // who leaves for Earth and comes back arrives in the city again.
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    beacons.dismiss()
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    expect(layer().dataset.visible).toBe('true')
  })

  it('does not restart its own dwell when armed twice over', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    vi.advanceTimersByTime(BEACON_DWELL_MS - 100)
    beacons.arm()
    vi.advanceTimersByTime(100)
    expect(beacons.isShowing, 'a second arm extended the dwell').toBe(false)
  })

  it('pins each beacon where its place is on screen', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    beacons.update(RECT, camera())
    expect(pin('servicios').dataset.pinned).toBe('true')
    expect(pin('servicios').style.transform).toBe('translate3d(400px, 300px, 0)')
  })

  it('unpins a place that is behind the camera', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    beacons.update(RECT, camera())
    expect(pin('servicios').dataset.pinned).toBe('true')

    servicesAt = BEHIND.clone()
    beacons.update(RECT, camera())
    expect(pin('servicios').dataset.pinned).toBeUndefined()
    // Its neighbour is still in front, and is unaffected.
    expect(pin('blog').dataset.pinned).toBe('true')
  })

  it('projects nothing at all while it is not showing', () => {
    // The beacons are on screen for six seconds of a visit that may last
    // minutes. Two projections and two style writes per frame for the rest of
    // it would be work for something nobody can see.
    const anchor = vi.fn((out: THREE.Vector3) => out.copy(AHEAD))
    const idle = new DistrictBeacons(host, [
      { id: 'x', anchor, label: 'X', caption: 'x' },
    ])
    idle.update(RECT, camera())
    expect(anchor).not.toHaveBeenCalled()
    idle.dispose()
  })

  it('stands down while the world owns the viewer', () => {
    beacons.arm()
    vi.advanceTimersByTime(BEACON_ARM_DELAY_MS)
    beacons.setSuppressed(true)
    expect(layer().dataset.suppressed).toBe('true')
    // Suppression is a state of the world, not a decision by the viewer, so it
    // lifts again — and the beacons are still armed underneath it.
    expect(beacons.isShowing).toBe(true)
    beacons.setSuppressed(false)
    expect(layer().dataset.suppressed).toBeUndefined()
  })

  it('takes its host out with it', () => {
    beacons.dispose()
    expect(host.querySelector('.district-beacons')).toBeNull()
  })
})
