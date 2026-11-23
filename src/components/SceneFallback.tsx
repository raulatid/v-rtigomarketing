import { useEffect, useRef } from 'react'
import { HOME_HEADLINE } from '../content/site'

/**
 * What the home page offers when the scene cannot run: no WebGL 2, or a fatal
 * boot before `site` (a required chunk that did not load, a throw inside the
 * scene, the load deadline). The copy says only that it could not load, which
 * is true of all of them. Accessibility audit 2026-11-18, D1: until this the page was an
 * empty banner and one control that did nothing, with no way to write, ask
 * for the audit or reach the blog.
 *
 * The drawing's own caption still says «No se pudo cargar la experiencia»
 * (`role="status"`); this is what comes after it. The h1 and its line stay in
 * `HomeHeadline`; this says what is still possible, as text and three real
 * controls: the blog is a document of its own that runs without WebGL, and the
 * two forms are the header's dialogs, opened by request.
 *
 * It takes the focus when it appears, on its title, so a keyboard and a screen
 * reader start here rather than on <body>.
 */
export interface SceneFallbackProps {
  onContact: () => void
  onAudit: () => void
  /** Contact or the audit is open over this. */
  dialogOpen: boolean
}

export function SceneFallback({ onContact, onAudit, dialogOpen }: SceneFallbackProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Not from a dialog already open over it: a form being filled keeps its place.
  const dialogOpenAtMount = useRef(dialogOpen)
  useEffect(() => {
    if (!dialogOpenAtMount.current) titleRef.current?.focus({ preventScroll: true })
  }, [])

  // The dialogs hand the focus back to their own trigger in the header, which
  // on a phone is inside the closed menu: it would land on <body>. Then it
  // comes back to the button here that opened the dialog.
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(dialogOpen)
  useEffect(() => {
    const closed = wasOpen.current && !dialogOpen
    wasOpen.current = dialogOpen
    if (!closed) return
    // Two frames: the audit gives its focus back a frame after it reports
    // closed (AuditSection's `close`), and this must look after it has.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) openerRef.current?.focus({ preventScroll: true })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [dialogOpen])

  return (
    <section className="scene-fallback" aria-labelledby="scene-fallback-title">
      <h2 ref={titleRef} id="scene-fallback-title" className="scene-fallback__title" tabIndex={-1}>
        No se ha podido cargar la experiencia 3D
      </h2>
      <p className="scene-fallback__lead">{HOME_HEADLINE.subheadline}</p>
      <p className="scene-fallback__body">Puedes seguir sin ella:</p>
      <ul className="scene-fallback__actions">
        <li>
          <button type="button" className="scene-fallback__action scene-fallback__action--primary" onClick={(e) => { openerRef.current = e.currentTarget; onAudit() }}>
            Solicita la auditoría
          </button>
        </li>
        <li>
          <button type="button" className="scene-fallback__action" onClick={(e) => { openerRef.current = e.currentTarget; onContact() }}>
            Escríbenos
          </button>
        </li>
        <li>
          <a className="scene-fallback__action" href="/blog">
            Lee el blog
          </a>
        </li>
      </ul>
    </section>
  )
}
