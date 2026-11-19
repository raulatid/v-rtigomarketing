import * as THREE from 'three'
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { imageBitmapsUsable } from './SkyShell'

/**
 * The surface-map loader for the AVIF prototype (`config/protoEarthTextures.ts`).
 * Only constructed when `?earthTex=` names a variant; the shipped path hands
 * `useLoader` the KTX2 loader directly and never reaches this file.
 *
 * One loader for a mixed list, because `EarthScene` loads its three maps in one
 * `useLoader` call: `.avif` URLs decode here, everything else goes to the shared
 * KTX2 loader (the clouds stay KTX2 in the prototype).
 *
 * The AVIF path is the sky's, so the arm measures what a shipped version would
 * do: an ImageBitmap decoded off the main thread and flipped at decode, because
 * WebGL ignores UNPACK_FLIP_Y for bitmaps (see `SkyShell.loadAsImageBitmap`). A
 * browser where bitmaps are unusable gets `TextureLoader`, whose `flipY = true`
 * flips on upload instead.
 */
export class ProtoEarthTextureLoader extends THREE.Loader<THREE.Texture> {
  private readonly ktx2: KTX2Loader

  constructor(ktx2: KTX2Loader) {
    super()
    this.ktx2 = ktx2
  }

  override load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    if (!url.endsWith('.avif')) {
      // `useLoader`'s extension callback sets the manager on THIS loader.
      this.ktx2.manager = this.manager
      this.ktx2.load(url, onLoad, onProgress, onError)
      return
    }

    const started = performance.now()
    const done = (texture: THREE.Texture) => {
      console.info(`[earthTex] ${url} decoded in ${Math.round(performance.now() - started)} ms`)
      onLoad(texture)
    }

    if (!imageBitmapsUsable()) {
      new THREE.TextureLoader(this.manager).load(url, done, onProgress, onError)
      return
    }

    const loader = new THREE.ImageBitmapLoader(this.manager)
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
      onError,
    )
  }
}
