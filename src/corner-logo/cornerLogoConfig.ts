/**
 * The six numbers this module needs, declared here rather than imported.
 *
 * They are tuned alongside the intro and live in Earth's `introConfig`, which
 * this module used to import wholesale — an experience dependency inside code
 * that ADR 002 established as application chrome precisely because it outlives
 * both experiences. `IntroConfig` satisfies this structurally, so the caller
 * passes the same object it always did and nothing changed but the arrow.
 *
 * WHERE the corner is does not live here any more (2026-09-03): the header
 * owns that line in CSS and CornerLogoLayer measures it — see `CornerMetrics`
 * in logoMotion.ts. Two copies of the same 48px had already drifted once.
 *
 * In its own file so the motion machine and the module that assembles it can
 * both name it without either importing the other.
 */
export interface CornerLogoConfig {
  /** Fit distance multiplier. Large values flatten the frustum toward ortho. */
  cornerFramePadding: number
  spinDuration: number
  spinPauseBefore: number
  swapCrossover: number
  swapDuration: number
  toCornerDuration: number
}

/** Minimal lifecycle exposed to an intro timeline. */
export interface CornerLogoHandle {
  startSequence: () => void
  isReady: () => boolean
}
