import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext, NavigationInput } from './createNavigationInput'
import type { NavigationIntent } from './navigationMachine'

interface Params {
  /** The navigation control root. Nothing is wired until it exists. */
  rootRef: RefObject<HTMLElement | null>
  /**
   * Read at every event and again at the commit.
   *
   * A function rather than a value, and it must read live sources rather than
   * React state wherever one exists. Two of the things it has to know — whether a
   * Murcia district is focused, whether a transition is running — are only correct
   * imperatively; their React mirrors lag by a render on the clearing edge, which
   * is the whole reason `transitioning` could not be used as the input lock.
   */
  getContext: () => NavigationContext
  onCommit: (intent: NavigationIntent) => void
  /**
   * Gesture progress, 0..1, every frame it changes.
   *
   * Read through a ref like the others, so a caller passing a fresh closure per
   * render cannot rebuild the listeners and drop a gesture in flight.
   */
  onProgress?: (progress: number) => void
  /**
   * The persistent zoom moved, -1..+1. Same ref treatment as the others.
   *
   * Separate from `onProgress` because the two are different KINDS of number:
   * progress is a transient the input owns and animates, the zoom is a position
   * the viewer owns and nothing here ever takes back.
   */
  onZoom?: (depth: number) => void
  /** The whole journey, raw. See `createNavigationInput`'s own `onApproach`. */
  onApproach?: (approach: number) => void
  /** A horizontal wheel swipe in Murcia. See `createNavigationInput`'s own `onLook`. */
  onLook?: (dxPx: number) => void
}

/**
 * Wires gesture navigation to the application, and owns its teardown.
 *
 * Deliberately thin. Everything that decides anything is in the three modules
 * beside it; this exists so `App` mounts one hook instead of an effect that has to
 * remember disposal order.
 *
 * The effect depends on NOTHING but the control root. Callbacks are read through refs, so
 * a parent re-render cannot tear down and rebuild the listeners — which would drop
 * an in-flight gesture, lose a running cooldown, and (worse) reset the machine
 * mid-transition, releasing the input lock while the warp is still playing.
 */
export function useSceneNavigation({
  rootRef,
  getContext,
  onCommit,
  onProgress,
  onZoom,
  onApproach,
  onLook,
}: Params) {
  const inputRef = useRef<NavigationInput | null>(null)

  const contextRef = useRef(getContext)
  contextRef.current = getContext
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress
  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom
  const approachRef = useRef(onApproach)
  approachRef.current = onApproach
  const lookRef = useRef(onLook)
  lookRef.current = onLook

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const input = createNavigationInput({
      root,
      getContext: () => contextRef.current(),
      onCommit: (intent) => commitRef.current(intent),
      onProgress: (progress) => progressRef.current?.(progress),
      onZoom: (depth) => zoomRef.current?.(depth),
      onApproach: (approach) => approachRef.current?.(approach),
      onLook: (dxPx) => lookRef.current?.(dxPx),
    })
    inputRef.current = input

    return () => {
      inputRef.current = null
      input.dispose()
    }
  }, [rootRef])

  /**
   * The transition has genuinely finished. Starts the cooldown from this instant.
   *
   * Wired to `useExperienceTransition`'s `onSettled` rather than to the
   * `transitioning` flag, because a cooldown that begins a render late is a window
   * in which a momentum tail is accepted.
   */
  const settle = useCallback(() => inputRef.current?.settle(), [])

  const navigateTo = useCallback((destination: NavigationContext['current']) => {
    inputRef.current?.navigateTo(destination)
  }, [])

  /** Drops any gesture in flight. Used when the intro phase moves under us. */
  const reset = useCallback(() => inputRef.current?.reset(), [])

  /**
   * The world under the zoom has been replaced. Wired to the warp's CUT.
   *
   * Memoised with no dependencies for the same load-bearing reason `reset` is:
   * it is handed to `useExperienceTransition`, which reads it through a ref that
   * must stay correct across a rebuild without ever changing identity.
   */
  const resetZoom = useCallback(() => inputRef.current?.resetZoom(), [])

  /**
   * The semantic inputs of `getContext` changed — a panel opened or closed, a
   * world became ready. The control derives its painted state from the context,
   * and the input's frame loop only runs mid-gesture, so this notification is
   * what keeps an idle control honest — and it is what re-arms the gesture hint
   * for a world the viewer has just arrived in.
   */
  const contextChanged = useCallback(() => inputRef.current?.contextChanged(), [])

  // Both are memoised with no dependencies, and that is load-bearing rather than
  // tidy. `App` lists `reset` in the dependency array of the effect that drops a
  // gesture when the intro phase moves; a fresh closure every render would make
  // that effect fire on every render instead, and silently cancel any gesture in
  // flight whenever anything at all in the application re-rendered.
  //
  // They close over a ref rather than over the input, so they stay correct across
  // a rebuild without ever changing identity.
  return { settle, reset, resetZoom, contextChanged, navigateTo }
}
