// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { PerspectiveCamera } from 'three'
import { createFocusCameraRig } from './createFocusCameraRig'
import { overviewRestPosition } from './overviewPose'
import { createCursorManager } from '../../../interaction/cursorManager'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'

// `setZoomDepth` runs every frame, Murcia included. It must answer from a
// cached viewport rather than reading layout, and still follow a resize.

const cfg = INTERACTION_CONFIG.camera

afterEach(() => vi.unstubAllGlobals())

it('reads the viewport on resize, not on every zoom update', () => {
  let resized: (() => void) | null = null
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  const canvas = document.createElement('canvas')
  const size = { width: 390, height: 844 }
  let reads = 0
  Object.defineProperty(canvas, 'clientWidth', { get: () => (reads++, size.width) })
  Object.defineProperty(canvas, 'clientHeight', { get: () => (reads++, size.height) })
  const camera = new PerspectiveCamera(45, size.width / size.height, 0.1, 1000)
  const rig = createFocusCameraRig({
    camera,
    domElement: canvas,
    cursor: createCursorManager(canvas),
    overviewPose: overviewRestPosition(),
    onEmptyClick() {},
    isOverSatellite: () => false,
  })
  rig.activate()
  const settled = () => {
    for (let i = 0; i < 600; i++) rig.update(1 / 60)
    return camera.position.length()
  }

  const before = reads
  for (let i = 0; i < 10; i++) rig.setZoomDepth(0)
  expect(reads).toBe(before)
  expect(settled()).toBeCloseTo(cfg.overviewRadius, 3)

  // A phone turned into a desktop-sized frame: the rest radius follows.
  size.width = 1920
  size.height = 1080
  resized!()
  rig.setZoomDepth(0)
  expect(settled()).toBeCloseTo(cfg.desktopOverviewRadius, 3)

  rig.dispose()
  expect(disconnect).toHaveBeenCalledOnce()
})
