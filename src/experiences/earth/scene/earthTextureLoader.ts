import * as THREE from 'three'
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { imageBitmapsUsable } from './SkyShell'

/**
 * The surface-map loader for a list that mixes AVIF and KTX2: the desktop set
 * (`EARTH_TEXTURES.wideAvif`, AVIF day and night with KTX2 clouds) and the
 * dev-only `?earthTex=` variants (`config/protoEarthTextures.ts`). A list with
 * no `.avif` in it never reaches this file: `EarthScene` hands `useLoader` the
 * KTX2 loader directly.
 *
 * One loader for the whole list, because `EarthScene` loads its three maps in
 * one `useLoader` call: `.avif` URLs decode here, everything else goes to the
 * shared KTX2 loader.
 *
 * The AVIF path is the sky's: an ImageBitmap decoded off the main thread and
 * flipped at decode, because WebGL ignores UNPACK_FLIP_Y for bitmaps (see
 * `SkyShell.loadAsImageBitmap`). A browser where bitmaps are unusable gets
 * `TextureLoader`, whose `flipY = true` flips on upload instead. Either way the
 * AVIF is stored top-down, unlike the KTX2 maps, which are bottom-left.
 *
 * An AVIF that does not decode is retried as `fallback[url]` through the KTX2
 * loader, when the table names one. That IS the AVIF support test, as in
 * `SkyShell.loadFirstAvailable`. Only a failure with no fallback left reaches
 * `onError`, which `EarthScene`'s manager makes fatal.
 *
 * Which is why the AVIF attempt does NOT run on `this.manager`: three's image
 * loaders call `manager.itemError` on a failed decode, and `EarthScene`'s
 * manager turns any item error into a fatal boot — before the fallback had a
 * chance. The attempt runs on a silent manager and this loader reports the item
 * to the real one by hand: started here, ended on success, and on a fallback
 * ended only AFTER the KTX2 request has started, so the manager's count never
 * reaches "all loaded" in between.
 */
export class EarthTextureLoader extends THREE.Loader<THREE.Texture> {
  private readonly ktx2: KTX2Loader
  private readonly fallback: Readonly<Record<string, string>>
  private readonly log: boolean

  constructor(ktx2: KTX2Loader, fallback: Readonly<Record<string, string>>, log: boolean) {
    super()
    this.ktx2 = ktx2
    this.fallback = fallback
    this.log = log
  }

  override load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    if (!url.endsWith('.avif')) {
      this.loadKtx2(url, onLoad, onProgress, onError)
      return
    }

    const manager = this.manager
    const silent = new THREE.LoadingManager()
    const started = performance.now()
    // Settles once. ImageBitmapLoader calls onLoad inside a promise whose
    // catch calls onError, so a throw from a consumer's onLoad would otherwise
    // start a fallback after a success and end the item twice.
    let settled = false
    manager.itemStart(url)
    const done = (texture: THREE.Texture) => {
      if (settled) return
      settled = true
      if (this.log) console.info(`[earthTex] ${url} decoded in ${Math.round(performance.now() - started)} ms`)
      onLoad(texture)
      manager.itemEnd(url)
    }
    const failed = (error: unknown) => {
      if (settled) return
      settled = true
      const fallback = this.fallback[url]
      if (fallback) {
        console.warn(`[earth] ${url} did not decode, falling back to ${fallback}`)
        this.loadKtx2(fallback, onLoad, onProgress, onError)
      } else {
        onError?.(error)
        manager.itemError(url)
      }
      manager.itemEnd(url)
    }

    if (!imageBitmapsUsable()) {
      new THREE.TextureLoader(silent).load(url, done, onProgress, failed)
      return
    }

    const loader = new THREE.ImageBitmapLoader(silent)
    loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
    loader.load(
      url,
      (bitmap) => {
        const texture = new THREE.Texture(bitmap)
        texture.flipY = false
        texture.needsUpdate = true
        done(texture)
      },
      onProgress,
      failed,
    )
  }

  private loadKtx2(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    // `useLoader`'s extension callback sets the manager on THIS loader.
    this.ktx2.manager = this.manager
    this.ktx2.load(url, onLoad, onProgress, onError)
  }
}
