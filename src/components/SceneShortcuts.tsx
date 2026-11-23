import { createPortal } from 'react-dom'
import { isPlainClick } from '../app/plainClick'

/**
 * Blog and Servicios in the site header: the two places, one press away.
 *
 * Rendered into the header's actions cell like Contacto and Auditoría
 * (`ContactSection.tsx`), so a desktop gets them as words on the line and a
 * phone as one line of places under the doors, and the menu folds on a press
 * without anything here asking it to. Bare words, with no caption or arrow:
 * they are the menu's second tier (siteMenu.css).
 *
 * Blog is a real link to `/blog` (accessibility audit 2026-11-18, G1): a
 * crawler and a screen reader's list of links find it, and it opens in a new
 * tab with a modifier. A plain click is still the journey (`useSceneShortcuts`),
 * not a page load. Servicios has no URL the scene can be sent to, so it stays a
 * button.
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
      {/* A link cannot be `disabled`: during a warp it says so and refuses the
          plain click, and a modified one still opens the blog elsewhere. */}
      <a
        href="/blog"
        className="scene-shortcut"
        data-shortcut="blog"
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          event.preventDefault()
          if (!disabled) onBlog()
        }}
      >
        Blog
      </a>
      <button type="button" className="scene-shortcut" data-shortcut="services" disabled={disabled} onClick={onServices}>
        Servicios
      </button>
    </>
  )
  return triggerHost ? createPortal(buttons, triggerHost) : buttons
}
