import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `decoders.ts` captures `DRACOLoader.prototype._loadLibrary` when it is
// imported, so the spy goes in first and every test imports a fresh module.
type LoadLibrary = (url: string, responseType: string) => Promise<unknown>
const proto = DRACOLoader.prototype as unknown as { _loadLibrary: LoadLibrary }
type Internal = { _initDecoder(): Promise<void> }

async function freshDecoders(loadLibrary: LoadLibrary) {
  vi.resetModules()
  const spy = vi.spyOn(proto, '_loadLibrary').mockImplementation(loadLibrary)
  const decoders = await import('./decoders')
  return { spy, decoders }
}

afterEach(() => { vi.restoreAllMocks() })

describe('shared Draco decoder', () => {
  it('fetches the decoder library once across pools that are released in between', async () => {
    const { spy, decoders } = await freshDecoders(async (url) => url.endsWith('.wasm') ? new ArrayBuffer(4) : '/* draco */')

    const first = decoders.acquireDracoLoader()
    await (first as unknown as Internal)._initDecoder()
    decoders.releaseDracoLoader()

    const second = decoders.acquireDracoLoader()
    expect(second).not.toBe(first) // the pool itself is still released and rebuilt
    await (second as unknown as Internal)._initDecoder()
    decoders.releaseDracoLoader()

    expect(spy.mock.calls.map(([url]) => url).sort()).toEqual(['draco_decoder.wasm', 'draco_wasm_wrapper.js'])
  })

  it('does not remember a failed fetch', async () => {
    let fail = true
    const { spy, decoders } = await freshDecoders(async (url) => {
      if (fail) throw new Error('offline')
      return url.endsWith('.wasm') ? new ArrayBuffer(4) : '/* draco */'
    })

    const first = decoders.acquireDracoLoader()
    await expect((first as unknown as Internal)._initDecoder()).rejects.toThrow('offline')
    decoders.releaseDracoLoader()

    fail = false
    const second = decoders.acquireDracoLoader()
    await (second as unknown as Internal)._initDecoder()
    decoders.releaseDracoLoader()

    expect(spy).toHaveBeenCalledTimes(4)
  })
})
