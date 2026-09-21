import { describe, expect, it } from 'vitest'
import { buildServicesContent } from './campusContent'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'
import { cityDistrictBindings } from '../scene/cityDistrictBindings'
import type { DistrictContent, DistrictService } from '../../../content/types'

// The CMS publishes `{ id, title, body }` plus the two shapes; the campus wants
// an intro and, per service, a subtitle, a detail, a symbol and a figure.
// Asserted against the content that actually ships, and against the ways a set
// goes wrong — which no longer include "a developer did not list this service".

const binding = cityDistrictBindings[0]!
const shipped = findDistrictContent(DISTRICT_CONTENT, binding.contentId)!

function service(i: number, body: string): DistrictService {
  return {
    id: `s${i}`,
    title: `S${i}`,
    body,
    particleColor: '#ffb020',
    figureCaption: null,
    measures: [],
    symbol: 'pin',
    figure: 'compound',
  }
}

function district(bodies: string[]): DistrictContent {
  return {
    id: 'servicios',
    label: 'Servicios',
    summary: 'Lo que hacemos.',
    intro: 'Unread.',
    particleColor: '#1c67ff',
    services: bodies.map((body, i) => service(i, body)),
  }
}

describe('the campus content', () => {
  it('builds a whole document from the shipped copy, in the content\'s order', () => {
    const content = buildServicesContent(shipped)
    expect(content).not.toBeNull()
    expect(content!.services.map((s) => s.id)).toEqual(shipped.services.map((s) => s.id))
    expect(content!.intro.title).toBe(shipped.label)
    expect(content!.intro.subtitle).toBe(shipped.summary)
  })

  it('never repeats the opening line in the detail', () => {
    const content = buildServicesContent(shipped)!
    for (const service of content.services) {
      // Short explanations have no additional detail; legacy prose does.
      if (service.detail !== service.subtitle) {
        expect(service.detail.startsWith(service.subtitle), service.id).toBe(false)
      }
      expect(service.detail.length, service.id).toBeGreaterThan(0)
    }
  })

  it('opens with what fits the summary and keeps the rest for the detail', () => {
    // Shaped like the published copy: a short hook, then a sentence long enough
    // that `splitServiceCopy` stops before it (its summary budget is 150).
    const hook = 'La búsqueda devuelve el trabajo.'
    const rest =
      'Auditamos lo que frena técnicamente a un sitio, reconstruimos la estructura que los ' +
      'buscadores leen de verdad y escribimos para las preguntas que la gente hace.'
    const content = buildServicesContent(district([`${hook} ${rest}`]))!
    expect(content.services[0]!.subtitle).toBe(hook)
    expect(content.services[0]!.detail).toBe(rest)
  })

  it('keeps a one-sentence body whole rather than losing the section to it', () => {
    const content = buildServicesContent(district(['Una sola frase.']))
    expect(content?.services[0]?.detail).toBe('Una sola frase.')
  })

  it('carries the entry\'s colour and each service\'s own into the particles', () => {
    const content = buildServicesContent(district(['Uno. Dos.']))!
    expect(content.intro.color).toBe('#1c67ff')
    expect(content.services[0]!.color).toBe('#ffb020')
  })

  it('carries each service\'s legend and «Qué medimos», and none as none', () => {
    const source = district(['Uno. Dos.', 'Tres. Cuatro.'])
    source.services[0] = {
      ...source.services[0]!,
      figureCaption: 'Lo que dibuja la figura.',
      measures: ['Coste por conversión'],
    }
    const content = buildServicesContent(source)!
    expect(content.services[0]!.caption).toBe('Lo que dibuja la figura.')
    expect(content.services[0]!.measures).toEqual(['Coste por conversión'])
    expect(content.services[1]!.caption).toBeNull()
    expect(content.services[1]!.measures).toEqual([])
  })

  it('carries the shapes the editor chose, per service', () => {
    const source = district(['Uno. Dos.', 'Tres. Cuatro.'])
    source.services[1] = { ...source.services[1]!, symbol: 'window', figure: 'funnel' }
    const content = buildServicesContent(source)!
    expect(content.services[0]!.icon).toBe('pin')
    expect(content.services[0]!.figure).toBe('compound')
    expect(content.services[1]!.icon).toBe('window')
    expect(content.services[1]!.figure).toBe('funnel')
  })

  it('rejects the set when a colour is not #rrggbb', () => {
    const bad = { ...district(['Uno. Dos.']), particleColor: 'blue' }
    expect(buildServicesContent(bad)).toBeNull()
  })
})

// THE REGRESSION. A service with no figure used to produce `figure: undefined`,
// which `parseServicesContent` rejects — and it rejects per DOCUMENT, so one
// service took the entire campus down to scenery and the build down with it.
//
// That is what happened on 2026-09-21: the shapes came from a table keyed by
// the service's slug, the editor published a service the table did not list,
// and `npm run build` stopped. The figure is an optional Studio field now and
// null is a supported document, so the section survives a service nobody has
// chosen a figure for — it simply does not turn into one.
describe('a service with no figure', () => {
  it('still builds the document, and the rest of the set is untouched', () => {
    const source = district(['Uno. Dos.', 'Tres. Cuatro.'])
    source.services[0] = { ...source.services[0]!, figure: null }

    const content = buildServicesContent(source)
    expect(content).not.toBeNull()
    expect(content!.services).toHaveLength(2)
    expect(content!.services[0]!.figure).toBeNull()
    // It keeps everything that is not the figure: the symbol still forms, the
    // copy still reads, the plate still fills.
    expect(content!.services[0]!.icon).toBe('pin')
    expect(content!.services[0]!.detail.length).toBeGreaterThan(0)
    expect(content!.services[1]!.figure).toBe('compound')
  })

  it('drops the legend, which names a figure, and keeps «Qué medimos», which does not', () => {
    // The legend exists to say what the figure draws, so with no figure it has
    // nothing to name — and the ones published the day this landed describe the
    // figures the PREVIOUS copy argued, which is the lie this whole change is
    // about. The highlights are ordinary copy and stay.
    //
    // `attachServicesCampus` is the other half: both ride one reveal in the
    // overlay, so it releases that reveal on the beat the turn would have
    // happened even when there is no turn, or the highlights would go with the
    // legend.
    const source = district(['Uno. Dos.'])
    source.services[0] = {
      ...source.services[0]!,
      figure: null,
      figureCaption: 'Lo que dibujaba la figura anterior.',
      measures: ['Coste por conversión'],
    }
    const content = buildServicesContent(source)!
    expect(content.services[0]!.caption).toBeNull()
    expect(content.services[0]!.measures).toEqual(['Coste por conversión'])
  })

  it('survives a whole section where nobody has chosen one yet', () => {
    // The state the five shipped services are in the day this lands: the copy
    // was rewritten and no figure has been re-chosen for any of them.
    const source = district(['Uno. Dos.', 'Tres. Cuatro.', 'Cinco. Seis.'])
    source.services = source.services.map((s) => ({ ...s, figure: null }))
    const content = buildServicesContent(source)
    expect(content).not.toBeNull()
    expect(content!.services.map((s) => s.figure)).toEqual([null, null, null])
  })

  it('but a figure the particles cannot draw is still a rejection', () => {
    // Only the API can deliver this — the Studio offers a closed list and the
    // content build refuses anything else. Permissive about ABSENT, not about
    // wrong: a name nothing can draw would fail at the layout, further from
    // the cause.
    const source = district(['Uno. Dos.'])
    source.services[0] = {
      ...source.services[0]!,
      figure: 'spiral' as unknown as DistrictService['figure'],
    }
    expect(buildServicesContent(source)).toBeNull()
  })
})

it('preserves the two editorial lines without joining or truncating them', () => {
  const body = 'Make your expertise discoverable.\nBuild a stronger search presence.'
  expect(buildServicesContent(district([body]))?.services[0]?.subtitle).toBe(body)
})
