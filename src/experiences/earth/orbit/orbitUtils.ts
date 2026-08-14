import * as THREE from 'three'
import { OrbitPreset } from './orbitConfig'

// Inclined circular orbit. A circle is arc-length uniform, so getPoint(t)
// already moves at constant speed — no arc-length table needed.
export class OrbitCurve extends THREE.Curve<THREE.Vector3> {
  radius: number
  orientation: THREE.Quaternion

  constructor({ radius, inclination, rotationY }: Pick<OrbitPreset, 'radius' | 'inclination' | 'rotationY'>) {
    super()
    this.radius = radius
    // Tilt the orbital plane (X), then orient it around the world Y axis.
    this.orientation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(inclination),
        THREE.MathUtils.degToRad(rotationY),
        0,
        'YXZ',
      ),
    )
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2
    target.set(Math.cos(angle) * this.radius, 0, Math.sin(angle) * this.radius)
    return target.applyQuaternion(this.orientation)
  }
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// A 2D context can legitimately be refused (memory pressure, canvas blocking),
// so this is checked rather than asserted. createOrbitSystem's caller converts
// the throw into the Spanish failure caption; naming the resource makes the
// report say what actually gave out instead of "cannot read properties of null".
function get2dContext(canvas: HTMLCanvasElement, who: string): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(`[${who}] 2D canvas context unavailable`)
  return ctx
}

// Soft radial gradient used for glow sprites and cloud points.
export function createRadialGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = get2dContext(canvas, 'radial-glow')
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// `createPlaceholderLogoTexture` lived here — a text badge drawn on a disc, used
// before the satellites became GLB models with a shared brand atlas. It had no
// callers left; the equivalent today is drawPlate in createBrandAtlas.ts.

// Solid white disc for the connectivity cloud's point sprites.
export function createCircleTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = get2dContext(canvas, 'circle-texture')
  const half = size / 2
  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  return new THREE.CanvasTexture(canvas)
}
