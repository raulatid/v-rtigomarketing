/**
 * A click the page may take over: the primary button with no modifier.
 *
 * The site's internal links are real `<a href>` (accessibility audit
 * 2026-11-18, G1: as buttons they were invisible to crawlers, to a screen
 * reader's list of links, and could not be opened in a new tab or copied).
 * A plain click still runs the journey the page draws — the flight to the
 * blog's screen, a post opened in place — and everything else (Ctrl, Cmd,
 * Shift, the middle button) is left to the browser, which opens the URL.
 */
export function isPlainClick(event: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  )
}
