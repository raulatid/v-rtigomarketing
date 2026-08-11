// Even point distribution on a sphere, lifted out of createConnectivityCloud so
// the space backdrop can reuse it (plan 004 §5) rather than copying it.
//
// Deterministic on purpose — no Math.random anywhere in here. Both consumers
// want the field to look identical on every load, and a seeded field is also
// diffable in screenshots, which matters for the occlusion check in plan 004 §6.

// Cheap deterministic hash in [0, 1). Only used for jitter and tier picking, so
// distribution quality matters far less than reproducibility.
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// `jitter` is a fraction of the radius applied per point (0.15 = ±15%). Zero
// gives an exact shell — which is what the connectivity cloud wants, and what
// makes the backdrop's non-occlusion guarantee provable (plan 004 §3).
export function fibonacciSpherePoints(count: number, radius: number, jitter = 0): Float32Array {
  const positions = new Float32Array(count * 3)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  // `|| 1` guards count === 1, where count - 1 is 0 and the division below
  // produced NaN for every component — a single point that silently vanishes
  // rather than sitting at the pole. The debug sliders' minimums are the only
  // thing keeping this unreachable today.
  const lastIndex = count - 1 || 1

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / lastIndex) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = goldenAngle * i

    // Jitter is applied to the radius only, never to the direction: pushing a
    // point inward is bounded and stays outside the camera's zoom range, whereas
    // an unbounded positional jitter would not be.
    const pointRadius = jitter > 0 ? radius * (1 + (hash01(i) * 2 - 1) * jitter) : radius

    positions[i * 3] = Math.cos(theta) * r * pointRadius
    positions[i * 3 + 1] = y * pointRadius
    positions[i * 3 + 2] = Math.sin(theta) * r * pointRadius
  }

  return positions
}

// Deterministic per-index value, exposed so callers can bucket points (e.g. into
// magnitude tiers) without reintroducing randomness.
export function pointSeed(index: number): number {
  return hash01(index + 1013)
}
