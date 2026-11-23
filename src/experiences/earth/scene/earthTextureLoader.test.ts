import * as THREE from 'three'
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The bitmap path is the one under test; SkyShell itself is a scene module.
vi.mock('./SkyShell', () => ({ imageBitmapsUsable: () => true }))

import { EarthTextureLoader } from './earthTextureLoader'

/**
 * The loader's whole job is bookkeeping on a manager that is fatal on any item
 * error (`EarthScene`'s `earthManager`), so these tests drive a real
 * `LoadingManager` and record what it was told, in order.
 */

type Outcome = 'ok' | 'fail'

function recordingManager() {
  const events: string[] = []
  const manager = new THREE.LoadingManager(
    () => events.push('all loaded'),
    undefined,
    (url) => events.push(`fatal ${url}`),
  )
  const start = manager.itemStart.bind(manager)
  const end = manager.itemEnd.bind(manager)
  manager.itemStart = (url) => {
    events.push(`start ${url}`)
    start(url)
  }
  manager.itemEnd = (url) => {
    events.push(`end ${url}`)
    end(url)
  }
  return { manager, events }
}

/** A KTX2 loader stand-in that reports to whatever manager it is handed, like FileLoader does. */
function fakeKtx2(outcome: Outcome = 'ok') {
  const loads: string[] = []
  const fake = {
    manager: THREE.DefaultLoadingManager,
    load(url: string, onLoad: (t: THREE.Texture) => void, _p?: unknown, onError?: (e: unknown) => void) {
      loads.push(url)
      const manager = fake.manager
      manager.itemStart(url)
      queueMicrotask(() => {
        if (outcome === 'ok') onLoad(new THREE.Texture())
        else {
          onError?.(new Error('ktx2 failed'))
          manager.itemError(url)
        }
        manager.itemEnd(url)
      })
    },
  }
  return { ktx2: fake as unknown as KTX2Loader, loads }
}

/** Makes every ImageBitmapLoader decode succeed or fail, reporting to its own manager as three does. */
function bitmapsWill(outcome: Outcome) {
  return vi.spyOn(THREE.ImageBitmapLoader.prototype, 'load').mockImplementation(function (
    this: THREE.ImageBitmapLoader,
    url,
    onLoad,
    _onProgress,
    onError,
  ) {
    this.manager.itemStart(url)
    queueMicrotask(() => {
      if (outcome === 'ok') onLoad?.({ width: 4, height: 2 } as unknown as ImageBitmap)
      else {
        onError?.(new Error('decode failed'))
        this.manager.itemError(url)
      }
      this.manager.itemEnd(url)
    })
    return {} as ImageBitmap
  })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EarthTextureLoader', () => {
  it('decodes an AVIF as an unflipped texture and reports it as one item', async () => {
    bitmapsWill('ok')
    const { manager, events } = recordingManager()
    const { ktx2, loads } = fakeKtx2()
    const loader = new EarthTextureLoader(ktx2, {}, false)
    loader.manager = manager
    const textures: THREE.Texture[] = []
    loader.load('/earth/day.avif', (t) => textures.push(t))
    await flush()

    expect(loads).toEqual([])
    expect(textures).toHaveLength(1)
    // Flipped at decode (imageOrientation), so not again at upload.
    expect(textures[0].flipY).toBe(false)
    expect(events).toEqual(['start /earth/day.avif', 'end /earth/day.avif', 'all loaded'])
  })

  it('falls back to the KTX2 file WITHOUT an item error, and never reaches "all loaded" in between', async () => {
    // THE test for trampa n.º 46: the decode failure must not reach the
    // manager's onError, which EarthScene makes a fatal boot.
    bitmapsWill('fail')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { manager, events } = recordingManager()
    const { ktx2, loads } = fakeKtx2('ok')
    const loader = new EarthTextureLoader(ktx2, { '/earth/day.avif': '/earth/day.ktx2' }, false)
    loader.manager = manager
    const textures: THREE.Texture[] = []
    const errors: unknown[] = []
    loader.load('/earth/day.avif', (t) => textures.push(t), undefined, (e) => errors.push(e))
    await flush()

    expect(loads).toEqual(['/earth/day.ktx2'])
    expect(textures).toHaveLength(1)
    expect(errors).toEqual([])
    expect(events).toEqual([
      'start /earth/day.avif',
      'start /earth/day.ktx2',
      'end /earth/day.avif',
      'end /earth/day.ktx2',
      'all loaded',
    ])
  })

  it('reports the error to the manager when there is no fallback left', async () => {
    bitmapsWill('fail')
    const { manager, events } = recordingManager()
    const { ktx2, loads } = fakeKtx2()
    const loader = new EarthTextureLoader(ktx2, {}, false)
    loader.manager = manager
    const errors: unknown[] = []
    loader.load('/proto-earth/r1/day.avif', () => {}, undefined, (e) => errors.push(e))
    await flush()

    expect(loads).toEqual([])
    expect(errors).toHaveLength(1)
    expect(events).toEqual([
      'start /proto-earth/r1/day.avif',
      'fatal /proto-earth/r1/day.avif',
      'end /proto-earth/r1/day.avif',
      'all loaded',
    ])
  })

  it('hands a non-AVIF URL straight to the KTX2 loader, on the real manager', async () => {
    const decode = bitmapsWill('ok')
    const { manager, events } = recordingManager()
    const { ktx2, loads } = fakeKtx2()
    const loader = new EarthTextureLoader(ktx2, {}, false)
    loader.manager = manager
    loader.load('/earth/clouds.ktx2', () => {})
    await flush()

    expect(decode).not.toHaveBeenCalled()
    expect(loads).toEqual(['/earth/clouds.ktx2'])
    expect(events).toEqual(['start /earth/clouds.ktx2', 'end /earth/clouds.ktx2', 'all loaded'])
  })
})
