/**
 * The notification the business receives, in both bodies a mail client expects.
 *
 * ── The rule this file exists for ──
 *
 * EVERY VALUE HERE CAME OFF THE WIRE, AND THIS IS A PRIVILEGED CONTEXT.
 *
 * `security-wordpress-api-2026-08-11.md` (API-3) names it: "an attacker's `name`
 * field is rendered in a privileged context, so it must be escaped there too".
 * The privileged context is this email — read in a mail client, by the one
 * person who acts on it, with none of a browser's suspicion.
 *
 * Two rules follow, and both are asserted rather than remembered:
 *   1. every submitted value is escaped, and
 *   2. THERE IS NO ANCHOR IN THIS EMAIL AT ALL.
 *
 * The second is what makes the submitted website safe by construction rather
 * than by careful attribute quoting. `validate.ts` has already refused hostile
 * schemes and private hosts, but a plausible `https://` URL can still be a
 * phishing destination, and a link in a notification is a link somebody clicks
 * because the mail looks like it came from their own website.
 */

import type { AuditSubmission, ContactSubmission } from './validate'

/** Long enough to be useful in an inbox list, short enough not to be truncated. */
export const SUBJECT_MAX = 120

export interface RenderedEmail {
  subject: string
  /** Plain text, for clients that prefer it and for forwarding. */
  text: string
  html: string
  /** So the recipient can simply hit reply and reach the enquirer. */
  replyTo: string
}

/** The three plan slugs, in the words the form used to offer them. */
const PLAN_LABELS: Record<string, string> = {
  seo: 'SEO',
  geo: 'GEO (Posicionamiento LLMs)',
  'auditoria-seo-completa': 'Auditoría SEO completa',
  sem: 'SEM',
  'diseno-web': 'Diseño web',
  desarrollo: 'Desarrollo y programación',
  'estrategia-marketing': 'Estrategias de marketing',
}

/** Shown where an optional field was left empty, so the gap reads as a choice. */
const NOT_GIVEN = '— no lo ha dejado'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** One line, whatever arrived. A subject is a header, and headers end at \n. */
function oneLine(value: string): string {
  // `\s` already covers CR, LF and the U+2028/U+2029 line separators, so this
  // needs no character class of its own — which is just as well, because a
  // LITERAL U+2028 inside a regex ends the literal in the middle of the file.
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1).trimEnd() + '…'
}

interface Row {
  label: string
  value: string
}

function textBody(intro: string, rows: Row[]): string {
  const lines = [intro, '']
  for (const row of rows) lines.push(row.label + ': ' + (row.value.length > 0 ? row.value : NOT_GIVEN))
  return lines.join('\n')
}

function htmlBody(intro: string, rows: Row[]): string {
  // Inline styles only, and few of them: a mail client is not a browser, and
  // half of them drop a <style> block. No anchor anywhere — see the header.
  const cells = rows
    .map((row) => {
      const value = row.value.length > 0 ? row.value : NOT_GIVEN
      return (
        '<p style="margin:0 0 12px"><strong>' +
        escapeHtml(row.label) +
        '</strong><br>' +
        escapeHtml(value).replace(/\n/g, '<br>') +
        '</p>'
      )
    })
    .join('')

  return (
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0b0b0d">' +
    '<p style="margin:0 0 16px">' +
    escapeHtml(intro) +
    '</p>' +
    cells +
    '</div>'
  )
}

export function renderAuditEmail(submission: AuditSubmission): RenderedEmail {
  const plan = PLAN_LABELS[submission.plan] ?? submission.plan
  const intro = 'Nueva solicitud de auditoría desde la web.'
  const rows: Row[] = [
    { label: 'Servicio de interés', value: plan },
    // Free text, and it reaches the row exactly as typed. Both label and value
    // go through escapeHtml in htmlBody, so `<script>` and `<img onerror=…>`
    // arrive as visible characters in a table cell — the row is the only place
    // they are ever rendered, and it is never an href.
    { label: 'Facturación', value: submission.revenue },
    { label: 'Presupuesto mensual', value: submission.budget },
    { label: 'Nombre', value: submission.name },
    { label: 'Email', value: submission.email },
    { label: 'Web', value: submission.website },
    { label: 'Teléfono', value: submission.phone },
  ]

  return {
    subject: truncate(oneLine('Auditoría · ' + submission.name + ' · ' + plan), SUBJECT_MAX),
    text: textBody(intro, rows),
    html: htmlBody(intro, rows),
    replyTo: submission.email,
  }
}

export function renderContactEmail(submission: ContactSubmission): RenderedEmail {
  const intro = 'Nuevo mensaje desde el formulario de contacto.'
  const rows: Row[] = [
    { label: 'Nombre', value: submission.name },
    { label: 'Email', value: submission.email },
    { label: 'Mensaje', value: submission.message },
  ]

  return {
    subject: truncate(oneLine('Contacto · ' + submission.name), SUBJECT_MAX),
    text: textBody(intro, rows),
    html: htmlBody(intro, rows),
    replyTo: submission.email,
  }
}
