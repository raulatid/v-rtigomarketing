// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LegalPanel } from './LegalPanel'
import { LEGAL_DOCS } from '../content/site'

// The legal body stopped being `string[]` and became typed blocks, so the panel
// grew a serializer. What these pin down:
//  - every block kind the union declares reaches a real element, because a kind
//    that silently rendered nothing would drop a clause from a legal notice;
//  - marks and links survive;
//  - nothing is ever injected as HTML — the whole reason structured content is
//    allowed to exist here at all.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(doc: 'terminos' | 'aviso' | null) {
  act(() => {
    root.render(<LegalPanel doc={doc} onClose={() => {}} />)
  })
}

describe('the legal panel', () => {
  it('renders nothing when no document is selected', () => {
    render(null)
    expect(host.querySelector('.legal-panel')).toBeNull()
  })

  it('renders the document title', () => {
    render('aviso')
    expect(host.querySelector('#legal-title')?.textContent).toBe(LEGAL_DOCS.aviso.title)
  })

  it('renders one element per block, and never fewer', () => {
    // A block kind with no case in the serializer would render nothing at all —
    // a clause silently missing from a published legal document.
    for (const id of ['terminos', 'aviso'] as const) {
      render(id)
      const body = host.querySelector('.legal-panel__body')
      expect(body, id).not.toBeNull()
      expect(body?.children.length, id).toBe(LEGAL_DOCS[id].body.length)
      for (const child of Array.from(body?.children ?? [])) {
        expect(['P', 'H3', 'H4', 'UL', 'OL'], id).toContain(child.tagName)
        expect(child.textContent?.trim().length, id + ' / ' + child.tagName).toBeGreaterThan(0)
      }
    }
  })

  it('renders a list as one list, not one list per item', () => {
    // Portable Text stores a list as consecutive sibling blocks. One <ul> per
    // item reads correctly and announces catastrophically.
    render('terminos')
    const lists = host.querySelectorAll('.legal-panel__body > ul, .legal-panel__body > ol')
    expect(lists.length).toBe(
      LEGAL_DOCS.terminos.body.filter((block) => block.kind === 'list').length,
    )
    for (const list of Array.from(lists)) {
      expect(list.querySelectorAll('li').length).toBeGreaterThan(0)
    }
  })

  it('keeps headings below the panel title in the outline', () => {
    // The panel's own title is the h2. A document heading that also rendered as
    // h2 would put two peers in one dialog for anyone navigating by headings.
    render('terminos')
    expect(host.querySelectorAll('.legal-panel__body h2').length).toBe(0)
    expect(host.querySelectorAll('.legal-panel__body h3').length).toBeGreaterThan(0)
  })

  it('renders marks and links', () => {
    render('terminos')
    expect(host.querySelector('.legal-panel__body strong')).not.toBeNull()
    const link = host.querySelector<HTMLAnchorElement>('.legal-panel__body a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toMatch(/^(https:|mailto:)/)
    // The only outbound links in the application, in the one document where a
    // referrer leak is least welcome.
    expect(link?.getAttribute('rel')).toBe('noreferrer')
  })

  it('never injects markup, whatever the content says', () => {
    // The serializer builds elements; it does not parse strings. Text that looks
    // like a tag has to come out as text.
    render('terminos')
    const body = host.querySelector('.legal-panel__body')
    for (const block of LEGAL_DOCS.terminos.body) {
      const texts = block.kind === 'list' ? block.items.flat() : block.spans
      for (const span of texts) {
        expect(span.text).not.toMatch(/<[a-z/]/i)
      }
    }
    expect(body?.querySelector('script')).toBeNull()
  })
})
