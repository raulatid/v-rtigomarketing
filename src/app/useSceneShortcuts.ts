import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ExperienceId } from './experience'
import type { HeaderMenuState } from '../corner-logo/headerMenuTiming'

/**
 * The header's Blog and Servicios buttons: a way to each place from anywhere.
 *
 * ## Why this is a journey and not a link
 *
 * The campus and the blog's panel exist only inside Murcia, and the header is
 * shown on Earth too. So either button on Earth is two moves the app already
 * knows how to make — the warp (`navigateTo('murcia')`) and, once it has
 * landed, the flight (`requestServices` / `requestBlog`) — chained through the
 * warp's one real end, `onSettled`. Blog used to open the /blog route straight
 * over Earth instead; that skipped the approach's cover and prefetch and opened
 * the route while the city could still be building under it, and it is gone.
 * A warp that is refused does nothing, for both.
 *
 * ## Why it waits for the menu
 *
 * A press on a phone lands inside the open menu, and the menu folds on it. The
 * navigation refuses a warp for the whole of that fold (`attentionIsFree`
 * counts `'closing'`), and a flight into a scene that is still tilted away is a
 * flight nobody sees. So the press is remembered and acted on when the menu
 * reports `'closed'` — at once on a desktop, where it always is.
 */

export type SceneShortcut = 'blog' | 'services'

/** What the city has to offer this module. `MurciaExperience` satisfies it. */
export interface SceneShortcutCity {
  flyToBlog(): boolean
  requestBlog(): void
  requestServices(): void
}

export interface SceneShortcutOptions {
  activeExperience: ExperienceId
  menuState: HeaderMenuState
  murciaRef: RefObject<SceneShortcutCity | null>
  /** Returns whether a warp was committed. */
  navigateTo: (destination: ExperienceId) => boolean
  openBlogIndex: () => void
}

export interface SceneShortcuts {
  request(shortcut: SceneShortcut): void
  /** Wire to the warp's `onSettled`. Stable across renders. */
  onWarpSettled(): void
}

export function useSceneShortcuts(options: SceneShortcutOptions): SceneShortcuts {
  const { activeExperience, menuState, murciaRef, navigateTo, openBlogIndex } = options
  const [pending, setPending] = useState<SceneShortcut | null>(null)
  // Set only when a warp toward the city was actually committed, so a refused
  // one cannot leave an arrival waiting for whichever warp happens next.
  const onArrival = useRef<SceneShortcut | null>(null)

  useEffect(() => {
    if (pending === null || menuState !== 'closed') return
    setPending(null)
    if (activeExperience !== 'murcia') {
      if (navigateTo('murcia')) onArrival.current = pending
      return
    }
    if (pending === 'blog') {
      // The flight to the panel; if that is refused — a district is open, or
      // there is no panel — the blog still opens, without it.
      if (!murciaRef.current?.flyToBlog()) openBlogIndex()
      return
    }
    murciaRef.current?.requestServices()
  }, [pending, menuState, activeExperience, murciaRef, navigateTo, openBlogIndex])

  const request = useCallback((shortcut: SceneShortcut) => setPending(shortcut), [])

  const onWarpSettled = useCallback(() => {
    const arrival = onArrival.current
    if (arrival === null) return
    onArrival.current = null
    if (arrival === 'blog') murciaRef.current?.requestBlog()
    else murciaRef.current?.requestServices()
  }, [murciaRef])

  return { request, onWarpSettled }
}
