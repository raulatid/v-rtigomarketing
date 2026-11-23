import type { RefObject } from 'react'

/**
 * The case studies as DOM: the keyboard and screen-reader way to the satellites.
 *
 * The satellites are raycast targets in a WebGL canvas, and a raycast cannot be
 * tabbed to or read aloud (accessibility audit 2026-11-18, T1). This is the
 * `districtA11y.ts` pattern on Earth: one real button per case in orbit, named
 * by the brand, each calling the SAME selection a click on its satellite makes
 * (`InteractionHandle.select`). One navigation model, a second way to reach it.
 *
 * Deliberately not a second visible UI: the buttons are clipped to a pixel and
 * unclipped on `:focus-visible` (`.nav-control` in `styles.css`), so the scene
 * is untouched for a pointer and a sighted keyboard user sees where they are.
 * Never `display: none` or `visibility: hidden` while offered: both take the
 * buttons out of the tab order, which is the one thing they exist to be in.
 */

export interface CaseListEntry {
  id: string
  name: string
}

export interface CaseListProps {
  cases: readonly CaseListEntry[]
  /** The open case, mirrored as `aria-expanded` on its button. */
  selectedId: string | null
  /** Off Earth the satellites are not there to select. */
  hidden: boolean
  /** The scene's answer: false when it refused (warp, audit, entrance). */
  onSelect: (id: string) => boolean
  /** The case panel returns focus here, to the case it closed (`CasePanel`). */
  listRef?: RefObject<HTMLDivElement | null>
}

export function CaseList({ cases, selectedId, hidden, onSelect, listRef }: CaseListProps) {
  if (cases.length === 0) return null
  return (
    // A group rather than a landmark or a list of links: a control cluster
    // inside the scene, like the district's (`districtA11y.ts`).
    <div ref={listRef} className="case-list" role="group" aria-label="Casos de éxito" hidden={hidden}>
      {cases.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="case-list__control"
          data-case-id={entry.id}
          aria-expanded={selectedId === entry.id}
          aria-controls="case-panel"
          onClick={() => onSelect(entry.id)}
        >
          {entry.name}
        </button>
      ))}
    </div>
  )
}

/** The button for a case, for the panel to hand focus back to. */
export function caseListButton(list: HTMLElement | null, id: string): HTMLElement | null {
  if (!list) return null
  for (const button of list.querySelectorAll<HTMLElement>('[data-case-id]')) {
    if (button.dataset.caseId === id) return button
  }
  return null
}
