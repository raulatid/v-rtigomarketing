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

// Soft radial gradient used for glow sprites and cloud points.
export function createRadialGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
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

// Neutral placeholder used until real case-study logo assets exist.
//
// The size is fitted rather than fixed. The original hardcoded 15.5% of the
// canvas, which suited the uniform-width "CASE 01" labels it was written for;
// real brand names vary from MANGO to FREIXENET and the long ones ran off the
// disc. Measuring and shrinking to fit costs one measureText at build time and
// means the sample data can be edited without anyone checking pixel widths.
const LABEL_MAX_WIDTH = 0.84 // fraction of the canvas the text may occupy

export function createPlaceholderLogoTexture(label: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const font = (px: number) => `600 ${px}px system-ui, -apple-system, sans-serif`
  let fontSize = Math.round(size * 0.155)
  ctx.font = font(fontSize)
  const width = ctx.measureText(label).width
  const limit = size * LABEL_MAX_WIDTH
  if (width > limit) {
    fontSize = Math.max(Math.floor(fontSize * (limit / width)), 8)
    ctx.font = font(fontSize)
  }

  ctx.fillText(label, size / 2, size / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Solid white disc for the connectivity cloud's point sprites.
export function createCircleTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2
  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  return new THREE.CanvasTexture(canvas)
}
