import { describe, expect, it } from 'vitest'
import { renderAuditEmail, renderContactEmail, SUBJECT_MAX } from './renderEmail'
import type { AuditSubmission, ContactSubmission } from './validate'

/**
 * The notification, and the reason it is a test file rather than a template.
 *
 * `security-wordpress-api-2026-08-11.md` records the finding this answers:
 * "an attacker's `name` field is rendered in a privileged context, so it must be
 * escaped there too". The privileged context is this email. It is read in a mail
 * client, by the one person on the receiving end, with none of a browser's
 * suspicion — so every value that came off the wire is escaped here, and the
 * submitted website is never turned into something clickable.
 */

const audit: AuditSubmission = {
  plan: 'completa',
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'https://example.com/',
  phone: '+34 600 000 000',
}

const contact: ContactSubmission = {
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  message: 'Hola, me gustaría saber más.',
}

/** Everything an attacker would try to put in a field that reaches an inbox. */
const HOSTILE = '<script>alert(1)</script> "><img src=x onerror=alert(1)> & \' end'

/**
 * The tags this email is allowed to contain, and the assertion that matters.
 *
 * Note what is NOT asserted: that the string "onerror" is absent. Escaped, it
 * is inert text, and the recipient is entitled to see exactly what somebody
 * submitted — including the fact that they submitted an attack. What must never
 * appear is a TAG that was not written by this module.
 */
const ALLOWED_TAGS = new Set(['div', 'p', 'strong', 'br'])

function tagsIn(html: string): string[] {
  return [...html.matchAll(/<\/?([a-z]+)/gi)].map((match) => match[1].toLowerCase())
}

describe('what the notification never contains', () => {
  it('escapes every submitted value in the HTML body', () => {
    const rendered = renderAuditEmail({
      ...audit,
      name: HOSTILE,
      phone: HOSTILE,
      email: 'a@example.com',
    })
    for (const tag of tagsIn(rendered.html)) expect(ALLOWED_TAGS, tag).toContain(tag)
    // The text still has to ARRIVE, escaped rather than dropped: the recipient
    // needs to see what was actually submitted.
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).toContain('&amp;')
    expect(rendered.html).toContain('&#39;')
  })

  it('escapes a hostile message on the contact form too', () => {
    const rendered = renderContactEmail({ ...contact, message: HOSTILE })
    for (const tag of tagsIn(rendered.html)) expect(ALLOWED_TAGS, tag).toContain(tag)
  })

  it('never renders a link, so the submitted website cannot be one', () => {
    // The single rule that makes the whole class safe: there is no anchor in
    // this email at all, so no submitted string can become a destination.
    const rendered = renderAuditEmail({ ...audit, website: 'https://evil.example/phish' })
    expect(rendered.html).not.toMatch(/<a[\s>]/i)
    expect(rendered.html).not.toContain('href')
    // It is still legible as text, because the recipient has to be able to read
    // and check it.
    expect(rendered.html).toContain('https://evil.example/phish')
    expect(rendered.text).toContain('https://evil.example/phish')
  })

  it('closes every tag it opens, apart from the void one', () => {
    // `<br>` has no closing form, so a naive count never balances. Everything
    // else must, or a mail client renders the rest of the message inside a
    // half-open element.
    const rendered = renderAuditEmail(audit)
    const opened = tagsIn(rendered.html.replace(/<\/[a-z]+/gi, '')).filter((tag) => tag !== 'br')
    const closed = [...rendered.html.matchAll(/<\/([a-z]+)/gi)].map((match) => match[1])
    expect(opened.slice().sort()).toEqual(closed.slice().sort())
  })
})

describe('the subject', () => {
  it('names which form was used', () => {
    expect(renderAuditEmail(audit).subject).toMatch(/auditor/i)
    expect(renderContactEmail(contact).subject).toMatch(/contacto/i)
  })

  it('carries the sender name, so an inbox list is readable', () => {
    expect(renderContactEmail(contact).subject).toContain('Nombre Prueba')
  })

  it('stays on one line', () => {
    // A newline in a subject is a header break. `validate.ts` strips them first;
    // this is the second door on the same room.
    const rendered = renderContactEmail({ ...contact, name: 'Uno\r\nBcc: victim@example.com' })
    expect(rendered.subject).not.toMatch(/[\r\n]/)
  })

  it('is capped, so a long name cannot run away with it', () => {
    const rendered = renderContactEmail({ ...contact, name: 'a'.repeat(500) })
    expect(rendered.subject.length).toBeLessThanOrEqual(SUBJECT_MAX)
  })
})

describe('what the notification is for', () => {
  it('replies to the person who wrote in', () => {
    // The whole point: the recipient hits reply and reaches the enquirer,
    // rather than copying an address out of the body.
    expect(renderContactEmail(contact).replyTo).toBe('prueba@example.com')
  })

  it('carries every audit field, including the optional one', () => {
    const rendered = renderAuditEmail(audit)
    for (const value of [audit.name, audit.email, audit.website, audit.phone]) {
      expect(rendered.text, value).toContain(value)
    }
    // The plan arrives as a slug and must be readable in an inbox.
    expect(rendered.text).toMatch(/completa/i)
  })

  it('says so plainly when the optional phone was left blank', () => {
    const rendered = renderAuditEmail({ ...audit, phone: '' })
    expect(rendered.text).toMatch(/tel[ée]fono/i)
    // An empty line beside a label reads as a rendering bug rather than as a
    // field the person chose not to fill.
    expect(rendered.text).toMatch(/no lo ha dejado|sin tel|—/i)
  })

  it('emits a text body beside the html one', () => {
    // Some clients prefer it, and it is what a plain-text forward carries.
    const rendered = renderContactEmail(contact)
    expect(rendered.text.length).toBeGreaterThan(0)
    expect(rendered.text).not.toContain('<')
    expect(rendered.text).toContain(contact.message)
  })

  it('keeps the message readable when it has paragraphs', () => {
    const rendered = renderContactEmail({ ...contact, message: 'Primero.\n\nSegundo.' })
    expect(rendered.text).toContain('Primero.')
    expect(rendered.text).toContain('Segundo.')
    // In HTML the break has to become markup, or the paragraphs run together.
    expect(rendered.html).toMatch(/<br|<\/p>/i)
  })
})
