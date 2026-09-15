import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createScreenPlayer } from './screenPlayer'
import { attachTowerScreen } from '../landmark/towerScreen/attachTowerScreen'
import { attachCampusScreen } from '../campus/campusScreen/attachCampusScreen'
import { createMediaFacade } from '../landmark/towerScreen/mediaFacade'
import { createComposition } from '../landmark/towerScreen/facadeRenderer'
import type { FacadeContentDocument } from '../landmark/towerScreen/content/facadeContent'

// Exercise real adapters and carousel; replace only canvas/GPU and asset IO.
vi.mock('../landmark/towerScreen/mediaFacade', () => ({
  createMediaFacade: vi.fn(({ mesh }) => {
    mesh.material = new THREE.MeshBasicMaterial()
    return {
      setComposition: vi.fn(), setProgress: vi.fn(), setShimmer: vi.fn(),
      setDust: vi.fn(), update: vi.fn(), dispose: vi.fn(),
    }
  }),
}))
vi.mock('../landmark/towerScreen/facadeRenderer', () => ({ createComposition: vi.fn() }))

let finishLoad: () => void
let failLoad: (reason: Error) => void
let loading: Promise<void>

beforeEach(() => {
  vi.clearAllMocks()
  loading = new Promise<void>((resolve, reject) => { finishLoad = resolve; failLoad = reject })
  vi.mocked(createComposition).mockImplementation(({ id, label }) => ({
    id, label, draw: vi.fn(), isAnimating: () => false,
    load: vi.fn(() => loading), dispose: vi.fn(),
  }))
})

const content: FacadeContentDocument = {
  compositions: ['first', 'second'].map((id) => ({ template: 'freeform', id, label: id, blocks: [] })),
  rotation: { compositions: ['second', 'first'], seconds: 2 },
}

function mesh(name = 'screen') {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
  screen.name = name
  return screen
}

function player(document = content, reducedMotion = false) {
  return createScreenPlayer(document, {
    reducedMotion, facade: { mesh: mesh(), resolution: 2048, anisotropy: 1, designMetresWide: 42.8 },
  })
}

describe('shared screen lifetime', () => {
  it('waits for the displayed slide and rotates without reassigning an unchanged composition', async () => {
    const screen = player()
    const compositions = vi.mocked(createComposition).mock.results.map((r) => r.value)
    expect(compositions[0].load).not.toHaveBeenCalled()
    expect(compositions[1].load).toHaveBeenCalledOnce()
    expect(screen.facade!.setComposition).toHaveBeenLastCalledWith(compositions[1])
    screen.update(0.016)
    expect(screen.facade!.setComposition).toHaveBeenCalledTimes(1)
    screen.update(2)
    expect(screen.facade!.setComposition).toHaveBeenLastCalledWith(compositions[0])
    finishLoad()
    await expect(screen.ready).resolves.toBe(true)
    screen.dispose()
  })

  it('disposes all owned resources once and rejects late readiness after disposal', async () => {
    const screen = player()
    screen.dispose()
    screen.dispose()
    screen.update(2)
    expect(screen.facade!.update).not.toHaveBeenCalled()
    expect(screen.facade!.dispose).toHaveBeenCalledOnce()
    for (const result of vi.mocked(createComposition).mock.results) {
      expect(result.value.dispose).toHaveBeenCalledOnce()
    }
    finishLoad()
    await expect(screen.ready).resolves.toBe(false)
  })

  it('propagates a failed first asset load', async () => {
    const screen = player()
    const failed = expect(screen.ready).rejects.toThrow('Asset unavailable')
    failLoad(new Error('Asset unavailable'))
    await failed
    screen.dispose()
  })

  it('holds the first composition without a playlist and suppresses shimmer and dust when reduced', () => {
    const screen = player({ compositions: content.compositions }, true)
    screen.update(1000)
    expect(screen.carousel!.frame.compositionId).toBe('first')
    expect(screen.facade!.setProgress).toHaveBeenLastCalledWith(1)
    expect(screen.facade!.setShimmer).toHaveBeenCalledWith(0)
    expect(screen.facade!.setDust).toHaveBeenCalledWith(0)
    screen.carousel!.show('missing')
    screen.update(0)
    expect(screen.facade!.setComposition).toHaveBeenLastCalledWith(null)
    screen.dispose()
  })

  it('stays inert without compositions and allocates no facade', async () => {
    const screen = player({ compositions: [] })
    await expect(screen.ready).resolves.toBe(false)
    expect(createMediaFacade).not.toHaveBeenCalled()
    screen.update(1)
    screen.dispose()
  })
})

describe.each([
  { name: 'tower', attach: attachTowerScreen, resolution: 2048, restore: false },
  { name: 'campus', attach: attachCampusScreen, resolution: 8192, restore: true },
])('$name adapter', ({ attach, resolution, restore }) => {
  it('preserves UV selection, resolution, material ownership and readiness', async () => {
    const surface = mesh('customscreen')
    const original = surface.material
    const screenUv = surface.geometry.getAttribute('uv').clone()
    surface.geometry.setAttribute('uv1', screenUv)
    const root = new THREE.Group().add(surface)
    const screen = attach(root, {
      anisotropy: 4, reducedMotion: true, document: content,
      screenNodeName: 'custom.screen', screenUvChannel: 1, maxTextureSize: 8192,
    })
    expect(surface.geometry.getAttribute('uv')).toBe(screenUv)
    expect(surface.geometry.getAttribute('uv1')).toBeUndefined()
    expect(createMediaFacade).toHaveBeenCalledWith(expect.objectContaining({
      mesh: surface, resolution, anisotropy: 4, ...(restore ? { flipY: false } : {}),
    }))
    expect(surface.material).not.toBe(original)
    finishLoad()
    await expect(screen.ready).resolves.toBe(true)
    screen.dispose()
    screen.dispose()
    expect(surface.material === original).toBe(restore)
    expect(screen.facade!.dispose).toHaveBeenCalledOnce()
  })

  it('warns and allocates no facade for an empty document', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const screen = attach(mesh(), {
      anisotropy: 1, reducedMotion: false, screenNodeName: 'screen', document: { compositions: [] },
    })
    await expect(screen.ready).resolves.toBe(false)
    expect(createMediaFacade).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
