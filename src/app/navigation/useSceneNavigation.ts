import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext, NavigationInput } from './createNavigationInput'
import type { NavigationIntent } from './navigationMachine'

interface Params {
  /** The rail element. Nothing is wired until it exists. */
  railRef: RefObject<HTMLElement | null>
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
}

/**
 * Wires gesture navigation to the application, and owns its teardown.
 *
 * Deliberately thin. Everything that decides anything is in the three modules
 * beside it; this exists so `App` mounts one hook instead of an effect that has to
 * remember disposal order.
 *
 * The effect depends on NOTHING but the rail. Callbacks are read through refs, so
 * a parent re-render cannot tear down and rebuild the listeners — which would drop
 * an in-flight gesture, lose a running cooldown, and (worse) reset the machine
 * mid-transition, releasing the input lock while the warp is still playing.
 */
export function useSceneNavigation({ railRef, getContext, onCommit }: Params) {
  const inputRef = useRef<NavigationInput | null>(null)

  const contextRef = useRef(getContext)
  contextRef.current = getContext
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    const input = createNavigationInput({
      rail,
      getContext: () => contextRef.current(),
      onCommit: (intent) => commitRef.current(intent),
    })
    inputRef.current = input

    return () => {
      inputRef.current = null
      input.dispose()
    }
  }, [railRef])

  /**
   * The transition has genuinely finished. Starts the cooldown from this instant.
   *
   * Wired to `useExperienceTransition`'s `onSettled` rather than to the
   * `transitioning` flag, because a cooldown that begins a render late is a window
   * in which a momentum tail is accepted.
   */
  const settle = useCallback(() => inputRef.current?.settle(), [])

  /** Drops any gesture in flight. Used when the intro phase moves under us. */
  const reset = useCallback(() => inputRef.current?.reset(), [])

  /**
   * The semantic inputs of `getContext` changed — a panel opened or closed, a
   * world became ready. The rail derives its visual state from the context,
   * and the input's frame loop only runs mid-gesture, so this notification is
   * what keeps an idle rail honest (see NavigationInput.contextChanged).
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
  return { settle, reset, contextChanged }
}
