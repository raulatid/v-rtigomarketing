import * as THREE from 'three'

import { SPACE_CONFIG } from './spaceConfig'
import { bandAxis } from './galaxyBand'
import bakeVertexShader from '../shaders/nebula/bake.vert.glsl'
import bakeFragmentShader from '../shaders/nebula/bake.frag.glsl'

// Renders the nebula into a cubemap once, ONE FACE PER FRAME.
//
// One face per frame is the same idiom `EarthScene` uses for its texture
// uploads, for the same reason: the drawing animation is live behind this, and
// a single frame that renders all six faces is a visible hitch in it. Six
// frames inside P0 is invisible.
//
// ── Why CubeCamera rather than a hand-rolled face basis ──
// The per-face orientation of a cubemap is the most error-prone part of baking
// one — get an axis sign wrong and one face is mirrored or upside down, with a
// visible seam. `CubeCamera` is an Object3D whose six children ARE the face
// cameras, in face order, already carrying three's own conventions. Borrowing
// them means the convention cannot be got wrong, while still leaving the
// render calls under our control so they can be spread across frames.
//
// ── Colour space ──
// The cube render target is linear (three's default for render targets), so
// the shader writes linear values and `colorspace_fragment` is a no-op there.
// `NebulaShell` then samples linear and outputs linear into the composer, whose
// OutputPass applies tone mapping and the sRGB conversion exactly once. This is
// also why the nebula is a mesh and not `scene.background`: a background is
// written as an UNTONE-MAPPED clear colour and would sit at the wrong
// brightness next to an ACES-mapped Earth (PROJECT_MEMORY.md).
//
// ── No mipmaps, deliberately ──
// At 1024 per face the cubemap is magnified on screen, never minified: a face
// covers 90 degrees at ~11 px/deg against a viewport showing ~45 degrees at
// ~24 px/deg. Mipmaps would be pure cost. This is worth re-checking only if
// `faceSize` drops a long way or the FOV widens a long way.

export interface NebulaBakeOptions {
  brightness: number
  dustDensity: number
  bandTiltDegrees: number
  bandWidth: number
}

export interface NebulaBake {
  texture: THREE.CubeTexture
  /** Renders the next unbaked face. Returns true while work remains. */
  bakeNextFace(renderer: THREE.WebGLRenderer): boolean
  isComplete(): boolean
  dispose(): void
}

export function createNebulaBake(options: NebulaBakeOptions): NebulaBake {
  const cfg = SPACE_CONFIG.nebula

  const target = new THREE.WebGLCubeRenderTarget(cfg.faceSize, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBandAxis: { value: bandAxis(options.bandTiltDegrees) },
      uBandWidth: { value: options.bandWidth },
      uBrightness: { value: options.brightness },
      uDustDensity: { value: options.dustDensity },
      uCoreColor: { value: new THREE.Color(cfg.coreColor) },
      uDustColor: { value: new THREE.Color(cfg.dustColor) },
      uHydrogenColor: { value: new THREE.Color(cfg.hydrogenColor) },
      uSeed: { value: cfg.seed },
    },
    vertexShader: bakeVertexShader,
    fragmentShader: bakeFragmentShader,
    // Seen from the inside.
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })

  const geometry = new THREE.SphereGeometry(1, 32, 24)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))

  // Borrowed purely for its six correctly-oriented face cameras.
  //
  // NOTE the constructor does NOT orient them. `CubeCamera` leaves
  // `coordinateSystem` null and only calls `updateCoordinateSystem()` from
  // inside `update()`, which is the method we are deliberately not using — so
  // without the call below all six cameras still look down -Z and every face
  // bakes the same image. Reading `renderer.coordinateSystem` rather than
  // hardcoding WebGL's is what `update()` itself does.
  const cubeCamera = new THREE.CubeCamera(0.01, 10, target)
  const faceCameras = cubeCamera.children as THREE.PerspectiveCamera[]
  let oriented = false

  let face = 0

  return {
    texture: target.texture,

    bakeNextFace(renderer: THREE.WebGLRenderer): boolean {
      if (face >= 6) return false

      if (!oriented) {
        cubeCamera.coordinateSystem = renderer.coordinateSystem
        cubeCamera.updateCoordinateSystem()
        cubeCamera.updateMatrixWorld(true)
        oriented = true
      }

      const previousTarget = renderer.getRenderTarget()
      renderer.setRenderTarget(target, face)
      renderer.clear()
      renderer.render(scene, faceCameras[face])
      // Restoring rather than nulling: this runs inside RenderPipeline's frame,
      // which must be left exactly as it was found.
      renderer.setRenderTarget(previousTarget)

      face++
      return face < 6
    },

    isComplete(): boolean {
      return face >= 6
    },

    dispose(): void {
      target.dispose()
      material.dispose()
      geometry.dispose()
    },
  }
}
