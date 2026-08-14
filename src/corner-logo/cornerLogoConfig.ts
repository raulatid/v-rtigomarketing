/**
 * The eight numbers this module needs, declared here rather than imported.
 *
 * They are tuned alongside the intro and live in Earth's `introConfig`, which
 * this module used to import wholesale — an experience dependency inside code
 * that ADR 002 established as application chrome precisely because it outlives
 * both experiences. `IntroConfig` satisfies this structurally, so the caller
 * passes the same object it always did and nothing changed but the arrow.
 *
 * In its own file so the motion machine and the module that assembles it can
 * both name it without either importing the other.
 */
export interface CornerLogoConfig {
  /** Fit distance multiplier. Large values flatten the frustum toward ortho. */
  cornerFramePadding: number
  cornerMarginX: number
  cornerMarginY: number
  spinDuration: number
  spinPauseBefore: number
  swapCrossover: number
  swapDuration: number
  toCornerDuration: number
}
