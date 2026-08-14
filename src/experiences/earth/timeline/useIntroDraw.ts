import { useEffect, useRef, useState } from 'react'
import { IntroConfig } from '../config/introConfig'
import type { IntroDrawHandle } from '../../../intro-draw/introDraw'

// Adopts the drawing that the boot entry started before this app chunk even
// downloaded. It never constructs one.
//
// Adoption rather than construction is the whole point: by the time React
// mounts, the isotype has been drawing for a while and is mid-stroke. Building
// an instance here would restart it — which is exactly the "the animation waits
// for the code to load" behaviour this replaces.
//
// Every import above is type-only. A value import of intro-draw would make
// Rollup hoist it into a chunk shared with the boot entry, giving that entry an
// import and failing the standalone assertion in vite.config.ts.
export function useIntroDraw(config: IntroConfig, replayKey: number) {
  const [complete, setComplete] = useState(false)
  const handleRef = useRef<IntroDrawHandle | null>(null)

  const intro = window.__vertigoIntro
  handleRef.current = intro?.handle ?? null

  useEffect(() => {
    if (!intro) {
      // index.html always ships the boot script, so this means the page was
      // assembled wrong. Fail open — the site still works, it just starts at
      // the shrink with no drawing rather than hanging forever.
      console.error('[intro] boot entry missing — skipping P0')
      setComplete(true)
      return
    }
    // Subscription, not intro.completed: that promise is one-shot, so after a
    // replay it would resolve instantly and hand straight back to the timeline.
    if (intro.handle.isDone()) setComplete(true)
    return intro.handle.subscribeComplete(() => setComplete(true))
  }, [intro])

  // `waitedTooLong` used to be read and re-exported here; App destructured only
  // { intro, complete } and never touched it. It remains on the boot global
  // (boot.ts) as a devtools-inspectable diagnostic, which is its only purpose —
  // it is explicitly NOT a readiness signal (plan 007 Phase 4). Mirroring it
  // through this hook just made it look like one.

  // Live config edits from the debug panel. Cheap — it re-lays out the stage
  // weights and re-measures; it never restarts the draw.
  useEffect(() => {
    handleRef.current?.setConfig(config)
  }, [config])

  // Replay rewinds the existing instance rather than rebuilding it: the DOM,
  // the sampled point tables and the measured path lengths all survive. Load
  // progress is already 1 by then, so the pace cap governs and the drawing
  // plays at its 3s floor — the replay shows the animation, not the wait.
  //
  // The guard tracks the replayKey this effect has already SEEN rather than a
  // "first run" boolean. React 19 StrictMode runs mount → cleanup → mount, and a
  // boolean flipped on the first mount stays flipped through the second — so the
  // remount replayed the drawing and restarted its 3s minimum-duration clock on
  // every dev page load. Comparing the key is idempotent under any number of
  // remounts, and still fires exactly once per real replay.
  const seenReplayKey = useRef(replayKey)
  useEffect(() => {
    if (seenReplayKey.current === replayKey) return
    seenReplayKey.current = replayKey
    setComplete(false)
    handleRef.current?.replay()
  }, [replayKey])

  return { intro: handleRef, complete }
}
