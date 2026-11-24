import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SubmitContactRequest } from '../app/contactSubmission'
import type { LegalDocId } from '../content/site'
import type { ContactPreview } from './ContactDialog'
import { ContactDialog, preloadContactDialog } from './LazyContactDialog'
import './modal.css'
import './contactSection.css'

// The contact form: a Contacto trigger beside the audit CTA in the site header
// and a compact dialog with three fields. AuditSection is the reference
// implementation this mirrors — same phase discipline (unmounted before
// `site`), same derived validation, same submission machine against the same
// kind of injected transport (contactSubmission.ts records why the transport
// must reject in production). It is deliberately a DIALOG and not a second
// curtain: the audit is the site's one full-attention ask, and a contact
// message does not outrank it. Mounted on Earth, Murcia and the blog alike
// since 2026-09-03, which is why its stylesheets are imported here rather than
// by styles.css.
//
// Since 2026-11-24 the form itself is ContactDialog.tsx, loaded on intent
// (LazyContactDialog.tsx): this keeps the trigger, whether the dialog is open
// and the focus's way back to the trigger.

interface Props {
  /** Editorial rendering without navigation, focus changes or submission. */
  preview?: ContactPreview
  /** Chrome may exist at all — `phase === 'site'` (DECISIONS §26.16). */
  ready: boolean
  /** The site header's actions cell, which the trigger portals into. Null
   *  renders it inline (tests). */
  triggerHost?: HTMLElement | null
  /** Prefix for element ids; two instances share a warm document (AuditSection
   *  says why). */
  idPrefix?: string
  /** The audit section owns the viewer's attention; the trigger stands down. */
  suppressed: boolean
  onOpenChange: (open: boolean) => void
  onOpenLegal: (doc: LegalDocId) => void
  /** Injectable for tests; defaults to the demo/production split transport. */
  submit?: SubmitContactRequest
  /**
   * Opens the dialog from outside the trigger — Conócenos' «Contacto». A
   * counter, for AuditSection's `openRequest` reasons: every CHANGE is one
   * request, and the section keeps owning whether it is open. Ignored while
   * not `ready`, while `suppressed` and while already open, exactly like the
   * trigger.
   */
  openRequest?: number
}

export function ContactSection({
  preview,
  ready,
  triggerHost = null,
  idPrefix = 'contact',
  suppressed,
  onOpenChange,
  onOpenLegal,
  submit,
  openRequest,
}: Props) {
  const [liveOpen, setOpen] = useState(false)
  /** The dialog mounts at the first open and stays, keeping what was written. */
  const [opened, setOpened] = useState(false)
  const open = preview ? true : liveOpen

  const triggerRef = useRef<HTMLButtonElement>(null)
  /** A close waiting for the closed render to hand the focus back. */
  const returnFocusRef = useRef(false)

  const openDialog = useCallback(() => {
    if (preview) return
    setOpen(true)
    setOpened(true)
    onOpenChange(true)
  }, [onOpenChange, preview])

  const close = useCallback(() => {
    if (preview) return
    setOpen(false)
    onOpenChange(false)
    // The trigger is what opened this; focus returns there, once the closed
    // render is committed (the effect below).
    returnFocusRef.current = true
  }, [onOpenChange, preview])

  // The audit took the screen (`suppressed` mirrors auditOpen in App.tsx). Its
  // curtain sits ABOVE this scrim, and the header that opens it sits above both
  // — so the trigger is reachable while this dialog is up, and without this the
  // dialog stayed mounted underneath, waiting behind the curtain. Disabling the
  // trigger only stops the reverse direction; this is the one that fires.
  useEffect(() => {
    if (suppressed && open) close()
  }, [suppressed, open, close])

  // Focus returns to the trigger once the closed render is committed: the
  // trigger is disabled while the dialog is open, and focusing it earlier
  // silently no-ops. A frame after the close was no promise of that — when it
  // landed before React's render, the focus ended on <body> (the audit's race,
  // forms trap n.º 24). Not when the audit took the screen: the trigger stays
  // disabled and the curtain owns the focus. And only if the focus is still
  // where the dialog left it, on <body>: one moved elsewhere is the reader's
  // (the audit's and CasePanel's rule).
  useEffect(() => {
    if (open || !returnFocusRef.current) return
    returnFocusRef.current = false
    if (suppressed) return
    const active = document.activeElement
    if (active && active !== document.body) return
    triggerRef.current?.focus()
  }, [open, suppressed])

  // An open request from outside the trigger (see `openRequest`), spent
  // whether or not it could be acted on, as AuditSection spends its own.
  const handledRequestRef = useRef(openRequest)
  useEffect(() => {
    if (openRequest === undefined || openRequest === handledRequestRef.current) return
    handledRequestRef.current = openRequest
    if (ready && !suppressed && !open) openDialog()
  }, [openRequest, ready, suppressed, open, openDialog])

  const trigger = !preview && ready && (
    <button
      ref={triggerRef}
      type="button"
      className="contact-trigger"
      data-suppressed={suppressed || open || undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={suppressed || open}
      onClick={openDialog}
      // The form's chunk, on the first sign of intent (LazyContactDialog.tsx).
      onPointerEnter={preloadContactDialog}
      onFocus={preloadContactDialog}
    >
      Contacto
      <svg className="site-menu-arrow" viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4 12h32m-6-6 6 6-6 6" />
      </svg>
      <span className="site-menu-caption">Cuéntanos qué tienes en mente</span>
    </button>
  )

  return (
    <>
      {/* Into the site header when there is one (SiteHeader.tsx). */}
      {triggerHost ? createPortal(trigger, triggerHost) : trigger}

      {(preview || opened) && (
        <ContactDialog
          open={open}
          preview={preview}
          idPrefix={idPrefix}
          onClose={close}
          onOpenLegal={onOpenLegal}
          submit={submit}
        />
      )}
    </>
  )
}
