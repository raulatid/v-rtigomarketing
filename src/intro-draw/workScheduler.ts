// The work region's scheduler (ADR 016, item 2): work nothing waits for is
// queued here with its kind, and starts when the opening admits it.
//
// Pure and dependency-free, like the machine whose rule it applies. It is
// stepped from the frame loop with the presentation state, because that is
// where the phase is read; it holds no clock and no state of the opening's.

import { admits, type Presentation, type WorkKind } from './openingMachine'

export interface WorkScheduler {
  /**
   * Queues `start` until the opening admits `kind`. Returns a cancel, which is
   * a no-op once `start` has run.
   */
  schedule(kind: WorkKind, start: () => void): () => void
  /** Starts whatever `presentation` admits, in the order it was queued. */
  step(presentation: Presentation): void
}

interface Unit {
  readonly kind: WorkKind
  readonly start: () => void
}

/**
 * Whether deferred work of this kind may start now.
 *
 * Never in `draw`, whatever `admits()` says. The machine admits everything
 * there for the required steps, which hold the drawing open until they are
 * done. Work nothing waits for has no such end, so started in `draw` it runs on
 * into `shrink`; and its bytes compete with the steps' own (audit 2026-08-27,
 * P1-D).
 */
export function admitsDeferred(presentation: Presentation, kind: WorkKind): boolean {
  return presentation !== 'draw' && admits({ presentation }, kind)
}

const onMainThread = (kind: WorkKind) => kind === 'main' || kind === 'gpu'

export function createWorkScheduler(): WorkScheduler {
  const queue: Unit[] = []

  return {
    schedule(kind, start) {
      const unit: Unit = { kind, start }
      queue.push(unit)
      return () => {
        const at = queue.indexOf(unit)
        if (at >= 0) queue.splice(at, 1)
      }
    },
    step(presentation) {
      // At most one main-thread start per frame: `site` admits main-thread
      // work in slices, and the slice's budget is still an open question
      // (ADR 016). One start is the smallest slice there is.
      let mainStarted = false
      // A copy, so a start that schedules or cancels cannot disturb the walk.
      for (const unit of [...queue]) {
        const main = onMainThread(unit.kind)
        if (!admitsDeferred(presentation, unit.kind) || (main && mainStarted)) continue
        const at = queue.indexOf(unit)
        // Cancelled by a start earlier in this walk.
        if (at < 0) continue
        queue.splice(at, 1)
        if (main) mainStarted = true
        unit.start()
      }
    },
  }
}
