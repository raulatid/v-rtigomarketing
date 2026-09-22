import { describe, expect, it } from 'vitest'
import type { TowerScreenContent } from '../../../../../content/types'
import type { FacadeContentDocument } from './facadeContent'
import { layoutTowerSlides } from './layoutTowerSlides'

// The template against the two slides that shipped bundled until 2026-09-22.
// `expected` is that document, pasted verbatim from the retired
// `TOWER_DOCUMENT` literal, so the visual result for the same words is
// provably unchanged by the move to the CMS.

const EARTH = '/textures/murcia/tower/global-earth-network-connections-001.webp'
const CHRISTMAS = '/textures/murcia/tower/imagen-navidad-descuento.webp'

const content: TowerScreenContent = {
  id: 'tower',
  rotationSeconds: 5,
  slides: [
    {
      id: 'tower',
      headline: 'VERTIGO',
      items: ['SEO', 'Marca', 'Progreso'],
      metric: { value: 50, suffix: '%' },
      caption1: 'CRECIMIENTO',
      caption2: 'EN TRÁFICO ORGÁNICO',
      caption3: 'EN LOS ÚLTIMOS 12 MESES',
      image: { src: EARTH, width: 612, height: 344, fit: 'cover' },
    },
    {
      id: 'tower-brand',
      headline: 'NAVIDAD',
      items: ['Identidad', 'Web', 'Crecimiento'],
      metric: { value: 30, prefix: '−', suffix: '%' },
      caption1: 'DESCUENTO',
      caption2: 'EN SERVICIOS',
      caption3: 'SELECCIONADOS',
      image: { src: CHRISTMAS, width: 260, height: 280, fit: 'contain' },
    },
  ],
}

const expected: FacadeContentDocument = {
  compositions: [
    {
      template: 'freeform',
      id: 'tower',
      label: 'tower',
      blocks: [
        { type: 'image', src: EARTH, at: [0, 46.2], size: [42.8, 61.62], fit: 'cover', feather: 6, stage: [0.3, 0.7] },
        { type: 'headline', text: 'VERTIGO', at: [7.5, 11.5], size: 4.2, tracking: 0.2, stage: [0.05, 0.3] },
        { type: 'list', items: ['SEO', 'Marca', 'Progreso'], at: [7.5, 22.5], size: 3.2, leading: 7.5, stagger: 0.08, reveal: 'wipe', stage: [0.15, 0.35] },
        { type: 'metric', value: 50, suffix: '%', at: [7.5, 121], size: 6, tone: 'accent', countUp: true, stage: [0.55, 0.85] },
        { type: 'caption', text: 'CRECIMIENTO', at: [7.5, 126], size: 1.8, tracking: 0.25, stage: [0.65, 0.85] },
        { type: 'caption', text: 'EN TRÁFICO ORGÁNICO', at: [7.5, 130.5], size: 1.3, tracking: 0.1, tone: 'muted', stage: [0.72, 0.92] },
        { type: 'caption', text: 'EN LOS ÚLTIMOS 12 MESES', at: [7.5, 134], size: 1.3, tracking: 0.1, tone: 'muted', stage: [0.78, 0.98] },
      ],
    },
    {
      template: 'freeform',
      id: 'tower-brand',
      label: 'tower-brand',
      blocks: [
        { type: 'image', src: CHRISTMAS, at: [0, 53.95], size: [42.8, 46.1], fit: 'contain', feather: 3, dust: true, stage: [0.3, 0.7] },
        { type: 'headline', text: 'NAVIDAD', at: [7.5, 11.5], size: 4.2, tracking: 0.2, stage: [0.05, 0.3] },
        { type: 'list', items: ['Identidad', 'Web', 'Crecimiento'], at: [7.5, 22.5], size: 3.2, leading: 7.5, stagger: 0.08, reveal: 'wipe', stage: [0.15, 0.35] },
        { type: 'metric', value: 30, prefix: '−', suffix: '%', at: [7.5, 121], size: 6, tone: 'accent', countUp: true, stage: [0.55, 0.85] },
        { type: 'caption', text: 'DESCUENTO', at: [7.5, 126], size: 1.8, tracking: 0.25, stage: [0.65, 0.85] },
        { type: 'caption', text: 'EN SERVICIOS', at: [7.5, 130.5], size: 1.3, tracking: 0.1, tone: 'muted', stage: [0.72, 0.92] },
        { type: 'caption', text: 'SELECCIONADOS', at: [7.5, 134], size: 1.3, tracking: 0.1, tone: 'muted', stage: [0.78, 0.98] },
      ],
    },
  ],
  rotation: { compositions: ['tower', 'tower-brand'], seconds: 5 },
}

describe('layoutTowerSlides', () => {
  const document = layoutTowerSlides(content)

  it('lays the cover slide out exactly as the bundled document did', () => {
    expect(document.compositions[0]).toEqual(expected.compositions[0])
    expect(document.rotation).toEqual(expected.rotation)
  })

  it('lays the contain slide out as the bundled document did, its box sized from the upload', () => {
    // The bundled literal wrote 46.1 × 53.95 by hand for a 260×280 picture;
    // the template derives 46.09 and 53.96 from the same numbers.
    const [image, ...words] = document.compositions[1]!.blocks
    const [expectedImage, ...expectedWords] = expected.compositions[1]!.blocks
    expect(words).toEqual(expectedWords)
    expect(image).toMatchObject({ type: 'image', src: CHRISTMAS, fit: 'contain', feather: 3, dust: true, stage: [0.3, 0.7] })
    if (image?.type !== 'image' || expectedImage?.type !== 'image') throw new Error('not an image block')
    expect(image.size[0]).toBe(42.8)
    expect(image.size[1]).toBeCloseTo(expectedImage.size[1], 1)
    expect(image.at[1]).toBeCloseTo(expectedImage.at[1], 1)
  })

  it('caps a portrait contain picture at the slot rather than spilling into the words', () => {
    const tall = layoutTowerSlides({
      ...content,
      slides: [{ ...content.slides[0]!, image: { src: EARTH, width: 100, height: 400, fit: 'contain' } }],
    })
    const image = tall.compositions[0]!.blocks[0]
    if (image?.type !== 'image') throw new Error('not an image block')
    expect(image.size[1]).toBe(61.62)
    expect(image.at[1]).toBe(46.2)
  })

  it('writes the headline and captions in capitals, whatever case the editor typed', () => {
    const typed = layoutTowerSlides({
      ...content,
      slides: [{ ...content.slides[0]!, headline: 'Vertigo', caption1: 'crecimiento' }],
    })
    const texts = typed.compositions[0]!.blocks.flatMap((block) => ('text' in block ? [block.text] : []))
    expect(texts[0]).toBe('VERTIGO')
    expect(texts[1]).toBe('CRECIMIENTO')
  })

  it('omits the block of every empty slot and moves nothing else', () => {
    const bare = layoutTowerSlides({
      ...content,
      slides: [{ id: 'one', headline: 'HOLA', items: [], metric: null, caption1: null, caption2: null, caption3: null, image: null }],
    })
    expect(bare.compositions[0]!.blocks).toEqual([
      { type: 'headline', text: 'HOLA', at: [7.5, 11.5], size: 4.2, tracking: 0.2, stage: [0.05, 0.3] },
    ])
  })

  it('holds a single slide rather than rotating it into itself', () => {
    const one = layoutTowerSlides({ ...content, slides: [content.slides[0]!] })
    expect(one.compositions).toHaveLength(1)
    expect(one.rotation).toBeUndefined()
  })

  it('yields no compositions for no slides, which the screen reads as dark', () => {
    expect(layoutTowerSlides({ ...content, slides: [] })).toEqual({ compositions: [] })
  })
})
