import { createPortal } from 'react-dom'

/**
 * Blog and Servicios in the site header: the two places, one press away.
 *
 * Rendered into the header's actions cell like Contacto and Auditoría
 * (`ContactSection.tsx`), so a desktop gets them as words on the line and a
 * phone as one line of places under the doors, and the menu folds on a press
 * without anything here asking it to. Bare words, with no caption or arrow:
 * they are the menu's second tier (siteMenu.css). They are LINKS in intent but
 * buttons in markup, because neither place is a URL the scene can be sent to —
 * the journey is `useSceneShortcuts`.
 */

export interface SceneShortcutsProps {
  /** `phase === 'site'`, the same gate as the header's other doors (DECISIONS §26.16). */
  ready: boolean
  triggerHost: HTMLElement | null
  /** While a warp runs: a press then would be refused, so it is not offered. */
  disabled: boolean
  onBlog: () => void
  onServices: () => void
}

export function SceneShortcuts({ ready, triggerHost, disabled, onBlog, onServices }: SceneShortcutsProps) {
  if (!ready) return null
  const buttons = (
    <>
      <button type="button" className="scene-shortcut" data-shortcut="blog" disabled={disabled} onClick={onBlog}>
        Blog
      </button>
      <button type="button" className="scene-shortcut" data-shortcut="services" disabled={disabled} onClick={onServices}>
        Servicios
      </button>
    </>
  )
  return triggerHost ? createPortal(buttons, triggerHost) : buttons
}
