import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ExperienceId } from './experience'
import type { HeaderMenuState } from '../corner-logo/headerMenuTiming'

/**
 * The header's Blog and Servicios buttons: a way to each place from anywhere.
 *
 * ## Why this is a journey and not a link
 *
 * The campus exists only inside Murcia, and the header is shown on Earth too.
 * So Servicios on Earth is two moves the app already knows how to make — the
 * warp (`navigateTo('murcia')`) and, once it has landed, the campus flight
 * (`MurciaExperience.requestServices`) — chained through the warp's one real
 * end, `onSettled`. Blog needs no chain: the /blog route opens over either
 * scene, and in the city it is flown to through the panel, as a press would.
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
  // Set only when a warp toward the campus was actually committed, so a refused
  // one cannot leave an arrival waiting for whichever warp happens next.
  const servicesOnArrival = useRef(false)

  useEffect(() => {
    if (pending === null || menuState !== 'closed') return
    setPending(null)
    const inCity = activeExperience === 'murcia'
    if (pending === 'blog') {
      // In the city, the flight to the panel; if that is refused — a district
      // is open, or there is no panel — the blog still opens, without it.
      if (!inCity || !murciaRef.current?.flyToBlog()) openBlogIndex()
      return
    }
    if (inCity) {
      murciaRef.current?.requestServices()
    } else if (navigateTo('murcia')) {
      servicesOnArrival.current = true
    }
  }, [pending, menuState, activeExperience, murciaRef, navigateTo, openBlogIndex])

  const request = useCallback((shortcut: SceneShortcut) => setPending(shortcut), [])

  const onWarpSettled = useCallback(() => {
    if (!servicesOnArrival.current) return
    servicesOnArrival.current = false
    murciaRef.current?.requestServices()
  }, [murciaRef])

  return { request, onWarpSettled }
}
