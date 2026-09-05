import { describe, expect, it } from 'vitest'
import { parseAuditBody, parseContactBody, CAPS, PLANS } from './validate'

/**
 * The server's own reading of a submission. The client validates too, and these
 * rules are DELIBERATELY a second copy rather than a shared module — the same
 * arrangement `ContactSection.tsx` records for its email pattern, for a stronger
 * reason here: a rule shared with the browser is a rule an attacker can read and
 * a rule that changes when the form changes. Nothing that arrives over the wire
 * is trusted, including the shape of the JSON itself.
 *
 * API-3 is the finding this file answers ("the audit form has no server-side
 * controls"), and API-2 is the one the website cases answer.
 */

const audit = {
  plan: 'auditoria-seo-completa',
  revenue: '20.000 - 100.000 €',
  budget: '2.000 - 5.000 €',
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'https://example.com',
  phone: '+34 600 000 000',
  empresa: '',
  startedAt: 1_757_000_000_000,
}

const contact = {
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  message: 'Hola, me gustaría saber más.',
  empresa: '',
  startedAt: 1_757_000_000_000,
}

function auditValue(patch: Record<string, unknown> = {}) {
  const result = parseAuditBody({ ...audit, ...patch })
  if (!result.ok) throw new Error('expected a valid payload, got: ' + JSON.stringify(result.fields))
  return result.value
}

function auditFields(patch: Record<string, unknown>): Record<string, string> {
  const result = parseAuditBody({ ...audit, ...patch })
  if (result.ok) throw new Error('expected a rejection, got a valid payload')
  return result.fields
}

function contactFields(patch: Record<string, unknown>): Record<string, string> {
  const result = parseContactBody({ ...contact, ...patch })
  if (result.ok) throw new Error('expected a rejection, got a valid payload')
  return result.fields
}

describe('the envelope', () => {
  it('refuses anything that is not a JSON object', () => {
    for (const raw of [null, undefined, 'a string', 42, [], true]) {
      const result = parseAuditBody(raw)
      expect(result.ok, JSON.stringify(raw)).toBe(false)
    }
  })

  it('refuses a field that arrives as the wrong type', () => {
    // `{name: {toString: ...}}` and `{name: ['a']}` are what a hand-rolled client
    // sends by accident and what a probe sends on purpose.
    expect(auditFields({ name: ['Nombre'] })).toHaveProperty('name')
    expect(auditFields({ email: { address: 'a@b.com' } })).toHaveProperty('email')
    expect(auditFields({ plan: 3 })).toHaveProperty('plan')
  })

  it('carries the honeypot and the start time out separately', () => {
    const result = parseAuditBody({ ...audit, empresa: 'Bot Industries' })
    // A filled honeypot is NOT a validation error — deciding what to do about it
    // belongs to handleSubmission, which answers 200 and sends nothing.
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.meta.honeypot).toBe('Bot Industries')
      expect(result.meta.startedAt).toBe(audit.startedAt)
    }
  })

  it('reports a missing or unusable start time as null rather than failing', () => {
    for (const startedAt of [undefined, null, 'soon', Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = parseAuditBody({ ...audit, startedAt })
      expect(result.ok, String(startedAt)).toBe(true)
      if (result.ok) expect(result.meta.startedAt).toBeNull()
    }
  })
})

describe('the shared text rules', () => {
  it('trims every value', () => {
    expect(auditValue({ name: '  Nombre Prueba  ' }).name).toBe('Nombre Prueba')
    expect(auditValue({ email: ' prueba@example.com ' }).email).toBe('prueba@example.com')
  })

  it('strips control characters', () => {
    // A NUL or an escape sequence in a name reaches a mail client, a log, and
    // the terminal reading that log, which will happily act on the escape.
    // Built rather than written, so this file stays ASCII: a literal NUL in a
    // source file is a landmine for the next person to open it.
    const NUL = String.fromCharCode(0)
    const ESC = String.fromCharCode(27)
    const typed = 'Nom' + NUL + 'bre' + ESC + '[31m'
    expect(auditValue({ name: typed }).name).toBe('Nombre[31m')
  })

  it('collapses newlines in single-line fields', () => {
    expect(auditValue({ name: 'Nombre\nPrueba' }).name).toBe('Nombre Prueba')
  })

  it('strips the bidirectional overrides, which escaping cannot help with', () => {
    // A right-to-left override renders everything after it backwards, so a name
    // can be made to display an address nobody typed — in the one email a
    // person actually acts on. It is not an injection: escapeHtml passes U+202E
    // through untouched, because as far as HTML is concerned nothing is wrong.
    // Built from code points so this file stays ASCII and stays readable.
    const RLO = String.fromCharCode(0x202e)
    const PDF = String.fromCharCode(0x202c)
    const LRM = String.fromCharCode(0x200e)
    const FSI = String.fromCharCode(0x2068)
    const BOM = String.fromCharCode(0xfeff)
    expect(auditValue({ name: 'Ana' + RLO + 'moc.live@' + PDF }).name).toBe('Anamoc.live@')
    expect(auditValue({ name: LRM + 'Ana' + FSI + BOM }).name).toBe('Ana')
  })

  it('keeps the zero-width joiner, because emoji are made of it', () => {
    // The line between the two: an override LIES about direction, a joiner is
    // part of a legitimate grapheme. Stripping U+200D would break every
    // multi-code-point emoji and several Indic and Persian spellings.
    const ZWJ = String.fromCharCode(0x200d)
    expect(auditValue({ name: 'Ana' + ZWJ + 'Ruiz' }).name).toContain(ZWJ)
  })

  it('rejects an empty required field', () => {
    expect(auditFields({ name: '   ' })).toHaveProperty('name')
    expect(auditFields({ email: '' })).toHaveProperty('email')
    expect(contactFields({ message: '  ' })).toHaveProperty('message')
  })

  it('rejects each field over its cap, naming that field', () => {
    expect(auditFields({ name: 'a'.repeat(CAPS.name + 1) })).toHaveProperty('name')
    expect(auditFields({ email: 'a'.repeat(CAPS.email) + '@example.com' })).toHaveProperty('email')
    expect(auditFields({ phone: '9'.repeat(CAPS.phone + 1) })).toHaveProperty('phone')
    expect(auditFields({ website: 'https://e.com/' + 'a'.repeat(CAPS.website) })).toHaveProperty(
      'website',
    )
    expect(contactFields({ message: 'a'.repeat(CAPS.message + 1) })).toHaveProperty('message')
  })

  it('accepts a value exactly at its cap', () => {
    expect(auditValue({ name: 'a'.repeat(CAPS.name) }).name).toHaveLength(CAPS.name)
  })

  it('answers in Spanish, in the form\'s own voice', () => {
    // The client renders these strings against the field. English here would be
    // the only English on the site.
    expect(auditFields({ name: '' }).name).toMatch(/[a-zá-ú]/i)
    expect(auditFields({ name: '' }).name).not.toMatch(/required|invalid|must be/i)
  })
})

describe('the email address', () => {
  it('accepts an ordinary one', () => {
    expect(auditValue({ email: 'Prueba@Example.com' }).email).toBe('Prueba@Example.com')
  })

  it('rejects a malformed one', () => {
    for (const email of ['prueba', 'prueba@', '@example.com', 'a@b', 'a b@example.com']) {
      expect(auditFields({ email }), email).toHaveProperty('email')
    }
  })

  it('rejects a header injection through the address', () => {
    // The address becomes `reply_to`. A newline there is the classic way to add
    // a Bcc: to somebody else's notification mail. The strip runs first, so this
    // is belt and braces over it — and it must stay a REJECTION rather than a
    // silent repair, because a repaired address is not the one that was typed.
    for (const email of [
      'a@b.com\r\nBcc: victim@example.com',
      'a@b.com\nCc: victim@example.com',
      'a@b.com%0ABcc: victim@example.com',
    ]) {
      expect(auditFields({ email }), email).toHaveProperty('email')
    }
  })
})

describe('the website (API-2)', () => {
  it('normalises a bare domain to https', () => {
    // The form's placeholder is `https://tuempresa.com` but people type
    // `tuempresa.com`, and the client has always accepted it.
    expect(auditValue({ website: 'example.com' }).website).toBe('https://example.com/')
    expect(auditValue({ website: 'www.example.com/ruta' }).website).toBe(
      'https://www.example.com/ruta',
    )
  })

  it('keeps an explicit http, because plenty of small sites are still http', () => {
    expect(auditValue({ website: 'http://example.com' }).website).toBe('http://example.com/')
  })

  it('refuses a scheme that is not http or https', () => {
    for (const website of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.com',
      'mailto:a@b.com',
    ]) {
      expect(auditFields({ website }), website).toHaveProperty('website')
    }
  })

  it('refuses credentials in the URL', () => {
    // `https://user:pass@evil.example/` renders in an inbox as `evil.example`
    // to a careful reader and as something else to a hurried one.
    expect(auditFields({ website: 'https://user:pass@example.com' })).toHaveProperty('website')
    expect(auditFields({ website: 'https://user@example.com' })).toHaveProperty('website')
  })

  it('refuses a private, loopback or link-local host', () => {
    // API-2. Nothing fetches this value today, and the answer to that finding is
    // that nothing ever should — but a URL that could only be interesting to a
    // fetcher has no business in a lead form either way.
    for (const website of [
      'http://127.0.0.1',
      'http://127.1',
      'https://localhost',
      'https://sub.localhost',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://0.0.0.0',
      'http://[::1]',
      'http://[fe80::1]',
      'http://[fc00::1]',
      'https://intranet.internal',
      'https://printer.local',
    ]) {
      expect(auditFields({ website }), website).toHaveProperty('website')
    }
  })

  it('refuses a host with no dot', () => {
    // A bare hostname is never a company website, and it is how an internal
    // name gets in past the ranges above.
    expect(auditFields({ website: 'http://intranet' })).toHaveProperty('website')
  })

  it('refuses a URL that does not parse at all', () => {
    expect(auditFields({ website: 'https://' })).toHaveProperty('website')
    expect(auditFields({ website: 'ht tp://example.com' })).toHaveProperty('website')
  })
})

describe('the audit form in particular', () => {
  it('accepts each service it offers and nothing else', () => {
    // Read from PLANS rather than restated, so adding a service to the list is
    // one edit. The point of the test is the CLOSED set, not the membership.
    for (const plan of PLANS) {
      expect(auditValue({ plan }).plan, plan).toBe(plan)
    }
    // `seo-tecnico` and `completa` are the pre-2026-09-04 values, and they are
    // in this list on purpose: a client cached with the old select must be
    // refused rather than quietly recorded against a service that no longer
    // exists.
    for (const plan of ['', 'otro', 'seo; DROP', 'SEO', 'seo-tecnico', 'completa']) {
      expect(auditFields({ plan }), plan).toHaveProperty('plan')
    }
  })

  it('takes the revenue and budget as free text, and still bounds them', () => {
    // Every one of these is a real answer a person would type. None of them
    // survives a schema, which is why there is no schema.
    for (const value of [
      '20.000 - 100.000 €',
      '20k / 100k',
      '20 000 a 100 000 €',
      '5000',
      'aprox. 3.000 al mes',
      '2k-4k',
      'No definido todavía',
    ]) {
      expect(auditValue({ revenue: value, budget: value }).revenue, value).toBe(value)
      expect(auditValue({ revenue: value, budget: value }).budget, value).toBe(value)
    }

    // Required, both of them.
    expect(auditFields({ revenue: '' })).toHaveProperty('revenue')
    expect(auditFields({ revenue: '   ' })).toHaveProperty('revenue')
    expect(auditFields({ budget: '' })).toHaveProperty('budget')
    expect(auditFields({ budget: undefined })).toHaveProperty('budget')

    // Bounded, both of them.
    expect(auditFields({ revenue: 'a'.repeat(CAPS.revenue + 1) })).toHaveProperty('revenue')
    expect(auditFields({ budget: 'a'.repeat(CAPS.budget + 1) })).toHaveProperty('budget')

    // Free text is not a hole in the control-character rule.
    expect(auditValue({ revenue: '20k  / 100k' }).revenue).toBe('20k / 100k')
    expect(auditValue({ budget: '2.000\r\n- 5.000' }).budget).toBe('2.000 - 5.000')
  })

  it('treats the phone as the one optional field', () => {
    expect(auditValue({ phone: '' }).phone).toBe('')
    expect(auditValue({ phone: undefined }).phone).toBe('')
  })

  it('reports every bad field at once, not just the first', () => {
    // The client renders these against the inputs; returning one at a time
    // would make a two-mistake form a two-round-trip form.
    const fields = auditFields({ name: '', email: 'nope', website: 'javascript:alert(1)' })
    expect(Object.keys(fields).sort()).toEqual(['email', 'name', 'website'])
  })
})

describe('the contact form in particular', () => {
  it('accepts an ordinary message', () => {
    const result = parseContactBody(contact)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.message).toBe(contact.message)
  })

  it('keeps the newlines inside a message, because it is prose', () => {
    const result = parseContactBody({ ...contact, message: 'Hola,\n\nDos párrafos.' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.message).toBe('Hola,\n\nDos párrafos.')
  })

  it('has no website field to abuse', () => {
    const result = parseContactBody({ ...contact, website: 'http://169.254.169.254' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).not.toHaveProperty('website')
  })
})
