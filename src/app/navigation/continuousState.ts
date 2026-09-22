import type { NavigationSignals } from '../../interaction/navigationSignals'

/** Application-owned mutable channel; never replaced or copied per frame. */
export function createNavigationState(): NavigationSignals {
  return {
    transitionOverlay: 0,
    transitionProgress: 0,
    transitionCommitted: false,
    departureAim: null,
    zoomDepth: 0,
  }
}
