/**
 * The phone menu's clock — the one copy of the numbers React and the
 * stylesheet both run on.
 *
 * Over the scene the menu is the viewport itself hinging away and sliding down
 * to reveal the navigation behind it (styles.css, `.app__viewport`). That motion
 * is a CSS transition, so nothing here interpolates; what React owns is the
 * PHASES, because the close has a tail. While the card is travelling back to
 * fullscreen the header must still report itself open — `attentionIsFree`
 * (App.tsx) reads that, and the chrome that stood down for the menu waits on it
 * too — and the only way to know when that tail ends is a timer that agrees with
 * the stylesheet's duration. App writes `MENU_MOTION_MS` onto the stage as
 * `--menu-3d-ms`, which is how the two stay one number.
 *
 * This module imports NOTHING, which is what lets SiteHeader read it without
 * opening a static edge into a three-importing module (see createCornerLogo.ts
 * on why that matters for the bundle).
 */

/**
 * `closing` is the card's way back. There is no `opening`: the reveal needs no
 * gate — Escape, a tap outside and a chosen door are all valid the instant the
 * card starts moving, and the stylesheet transitions from wherever it is.
 */
export type HeaderMenuState = 'closed' | 'open' | 'closing'

/** The card's travel, both directions. Written to `--menu-3d-ms` by App. */
export const MENU_MOTION_MS = 560

/**
 * The house's reduced-motion clock — the same 60 ms AuditSection and
 * ConsentBanner use, rather than a 1 ms that reads as a magic number. The
 * stylesheet collapses its transitions to 1 ms under the same query, so the
 * phase outlives the motion by design and never the other way round.
 */
export const MENU_REDUCED_MS = 60
