// Ported from the dolly-earth prototype (docs/extractions/002).
// The warp reads ONE progress value through three different curves — position,
// speed-effects and the scene cut are deliberately not the same timeline.

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// Slow ease-in → fast travel → soft ease-out. Controls camera POSITION.
export function cinematicTravel(t: number, power = 1.7): number {
  const x = clamp01(t)
  if (x < 0.5) return 0.5 * Math.pow(x * 2, power)
  return 1 - 0.5 * Math.pow((1 - x) * 2, power)
}

// Wide bell peaking at `peak`. Controls FOV and motion blur INTENSITY.
export function cinematicSpeed(t: number, peak = 0.5, width = 0.34): number {
  const normalized = clamp01(1 - Math.abs(clamp01(t) - peak) / width)
  return smootherstep(0, 1, normalized)
}

// Narrow bell for masking a cut. Controls the black overlay.
export function narrowPeak(t: number, center = 0.5, width = 0.12): number {
  const normalized = clamp01(1 - Math.abs(clamp01(t) - center) / width)
  return smootherstep(0, 1, normalized)
}
