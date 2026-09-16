import { describe, expect, it } from 'vitest'
import { buildServicesContent } from './campusContent'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'
import { cityDistrictBindings } from '../scene/cityDistrictBindings'
import type { DistrictContent } from '../../../content/types'

// The CMS publishes `{ id, title, body }`; the campus wants an intro and, per
// service, a subtitle, a detail, a symbol and a figure. Asserted against the
// content that actually ships, and against the two ways a set goes wrong.

const binding = cityDistrictBindings[0]!
const shipped = findDistrictContent(DISTRICT_CONTENT, binding.contentId)!

function district(bodies: string[]): DistrictContent {
  return {
    id: 'servicios',
    label: 'Servicios',
    summary: 'Lo que hacemos.',
    intro: 'Unread.',
    particleColor: '#1c67ff',
    services: bodies.map((body, i) => ({
      id: `s${i}`,
      title: `S${i}`,
      body,
      particleColor: '#ffb020',
      figureCaption: null,
      measures: [],
    })),
  }
}

const symbols = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ serviceId: `s${i}`, icon: 'pin', figure: 'compound' as const }))

describe('the campus content', () => {
  it('builds a whole document from the shipped copy, in the content\'s order', () => {
    const content = buildServicesContent(shipped, binding.services)
    expect(content).not.toBeNull()
    expect(content!.services.map((s) => s.id)).toEqual(shipped.services.map((s) => s.id))
    expect(content!.intro.title).toBe(shipped.label)
    expect(content!.intro.subtitle).toBe(shipped.summary)
  })

  it('never repeats the opening line in the detail', () => {
    const content = buildServicesContent(shipped, binding.services)!
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
    const content = buildServicesContent(district([`${hook} ${rest}`]), symbols(1))!
    expect(content.services[0]!.subtitle).toBe(hook)
    expect(content.services[0]!.detail).toBe(rest)
  })

  it('keeps a one-sentence body whole rather than losing the section to it', () => {
    const content = buildServicesContent(district(['Una sola frase.']), symbols(1))
    expect(content?.services[0]?.detail).toBe('Una sola frase.')
  })

  it('carries the entry\'s colour and each service\'s own into the particles', () => {
    const content = buildServicesContent(district(['Uno. Dos.']), symbols(1))!
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
    const content = buildServicesContent(source, symbols(2))!
    expect(content.services[0]!.caption).toBe('Lo que dibuja la figura.')
    expect(content.services[0]!.measures).toEqual(['Coste por conversión'])
    expect(content.services[1]!.caption).toBeNull()
    expect(content.services[1]!.measures).toEqual([])
  })

  it('rejects the set when a colour is not #rrggbb', () => {
    const bad = { ...district(['Uno. Dos.']), particleColor: 'blue' }
    expect(buildServicesContent(bad, symbols(1))).toBeNull()
  })

  it('rejects the set when a service has no symbol row', () => {
    expect(buildServicesContent(district(['Uno. Dos.', 'Tres. Cuatro.']), symbols(1))).toBeNull()
  })

  it('rejects the set when a row names a figure the particles cannot draw', () => {
    const bad = [{ serviceId: 's0', icon: 'pin', figure: 'spiral' as unknown as 'compound' }]
    expect(buildServicesContent(district(['Uno. Dos.']), bad)).toBeNull()
  })
})

it('preserves the two editorial lines without joining or truncating them', () => {
  const body = 'Make your expertise discoverable.\nBuild a stronger search presence.'
  expect(buildServicesContent(district([body]), symbols(1))?.services[0]?.subtitle).toBe(body)
})
