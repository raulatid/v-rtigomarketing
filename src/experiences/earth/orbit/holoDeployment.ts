// The hologram's deployment, as stages of ONE eased value.
//
// Plan 007 phase 6: the split-plate unfold should read in roughly three
// perceptual stages — the core activates, the wings deploy, the logo resolves —
// while remaining, technically, a single scalar. This module is that remap and
// nothing else: it takes the eased expansion `panelExpansion.ts` produces and
// returns every derived quantity the shader needs, so the shader never carries
// range constants of its own and the stages cannot drift apart.
//
// Overlapping ranges, deliberately. Three disjoint ranges would read as three
// animations played back to back; overlapped, the wings begin travelling while
// the core is still brightening and the logo begins arriving before the wings
// settle — one gesture with internal rhythm. The numbers are artistic guidance
// and may be retuned; the shape (activation leads, resolve lands last) is what
// the test protects.
//
// Pure, like panelExpansion.ts, so it is testable in Node. Because it is a pure
// function of the eased value, reversal costs nothing: the closing sequence is
// the opening one sampled backwards.

export interface Deployment {
  /** The core's energy response: brackets brighten, wing origins appear. */
  activation: number
  /** The wings' travel and the projection field's opening. */
  deploy: number
  /** The isotype→logo crossfade and the settle of the selected-state glow. */
  resolve: number
  /** Aspect of the artwork field, 1 (square core) → 2 (core plus both wings). */
  fieldAspect: number
  /** Each wing's current length, in pane heights. */
  wingExtent: number
}

/** [start, end] of each stage over the eased expansion. */
export const DEPLOYMENT_STAGES = {
  activation: [0.0, 0.2],
  deploy: [0.15, 0.8],
  resolve: [0.75, 1.0],
} as const

export function deploymentFrom(eased: number, wingLength: number): Deployment {
  const t = clamp01(eased)
  const activation = stage(t, DEPLOYMENT_STAGES.activation)
  const deploy = stage(t, DEPLOYMENT_STAGES.deploy)
  const resolve = stage(t, DEPLOYMENT_STAGES.resolve)
  return {
    activation,
    deploy,
    resolve,
    fieldAspect: 1 + deploy,
    wingExtent: wingLength * deploy,
  }
}

// Smoothstep over the range: zero slope at both ends, so consecutive stages
// hand over without a visible kink even where their ranges overlap.
function stage(t: number, [start, end]: readonly [number, number]): number {
  const x = clamp01((t - start) / (end - start))
  return x * x * (3 - 2 * x)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}
