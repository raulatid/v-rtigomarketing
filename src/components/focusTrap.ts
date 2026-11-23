/**
 * Keeps Tab inside a modal surface: from the last control back to the first,
 * and from the first (or the focused title) back to the last.
 *
 * The trap `LegalPanel` has had since it was written, as a function the other
 * modals can share (accessibility audit 2026-11-18, F1 and F2: Contacto
 * declared `aria-modal` and Tab walked out of it to the page behind; the audit
 * curtain had no trap at all).
 *
 * "Reachable" means focusable AND rendered: not disabled, not `tabindex=-1`,
 * with a box, and not inside a closed `<details>` (whose content has a box in
 * some engines but cannot take the focus — the escape F6 found in
 * `LegalPanel`'s own copy).
 */

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

export function tabbableIn(container: HTMLElement): HTMLElement[] {
  // Sorted by document order explicitly: browsers return it already, but
  // jsdom's selector engine groups the results by selector.
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )
  return all.filter((el) => {
    if (el.tabIndex < 0) return false
    if (el.closest('[inert], [aria-hidden="true"]')) return false
    const details = el.closest('details')
    if (details && !details.open && el.tagName !== 'SUMMARY') return false
    return el.getClientRects().length > 0
  })
}

/**
 * Handles one keydown for a surface. Returns true when it moved the focus.
 * The focus outside the surface altogether (a click on the page behind that
 * landed somewhere focusable) is brought back in on the next Tab.
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !container) return false
  const nodes = tabbableIn(container)
  if (nodes.length === 0) return false
  const first = nodes[0]!
  const last = nodes[nodes.length - 1]!
  const active = document.activeElement
  const inside = active instanceof Node && container.contains(active)
  // Another modal opened over this one (the legal panel over Contacto or the
  // audit) owns Tab: the trap underneath stands aside.
  if (!inside && active instanceof Element && active.closest('[aria-modal="true"]')) return false
  if (!inside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return true
  }
  // A focused element outside the list — the title (`tabindex=-1`), where the
  // surfaces put the focus on opening — is placed by document order: the trap
  // wraps only when nothing is left in that direction.
  const precedes = (node: HTMLElement) =>
    Boolean(node.compareDocumentPosition(active as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
  const listed = nodes.includes(active as HTMLElement)
  const atStart = listed ? active === first : !nodes.some(precedes)
  const atEnd = listed ? active === last : nodes.every(precedes)
  if (event.shiftKey && atStart) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && atEnd) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}
