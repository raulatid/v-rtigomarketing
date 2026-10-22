import { describe, expect, it } from 'vitest'
import type { ListBlock } from '../facadeComposition'
import { ABOUT_SENTENCES_ID, layoutAboutSentences } from './layoutAboutSentences'

const SENTENCES = [
  'Somos Vértigo.',
  'Estrategia, marca y datos.',
  'Desde Murcia al mundo.',
  'Más de 12 años creciendo.',
  'Hacemos crecer marcas.',
]

const lists = (sentences: readonly string[]) => layoutAboutSentences(sentences).blocks as ListBlock[]

describe('the five sentences on the tower screen', () => {
  it('is one composition named apart from the tower slides, one wiped list per sentence', () => {
    const composition = layoutAboutSentences(SENTENCES)
    expect(composition.id).toBe(ABOUT_SENTENCES_ID)
    expect(composition.blocks).toHaveLength(5)
    for (const block of lists(SENTENCES)) {
      expect(block).toMatchObject({ type: 'list', reveal: 'wipe', size: 2.7 })
      expect(block.at[0]).toBe(7.5)
    }
  })

  it('cuts each sentence at its spaces into the lines the content build measured', () => {
    expect(lists(SENTENCES).map((block) => block.items)).toEqual([
      ['Somos Vértigo.'],
      ['Estrategia,', 'marca y datos.'],
      ['Desde Murcia al', 'mundo.'],
      ['Más de 12 años', 'creciendo.'],
      ['Hacemos crecer', 'marcas.'],
    ])
  })

  it('writes them in one after another, each starting after the one before', () => {
    const stages = lists(SENTENCES).map((block) => block.stage)
    for (let i = 1; i < stages.length; i += 1) expect(stages[i]![0]).toBeGreaterThan(stages[i - 1]![0])
    // The last line of the last sentence has settled before the entrance ends.
    const last = lists(SENTENCES).at(-1)!
    expect(last.stage[1] + (last.items.length - 1) * (last.stagger ?? 0)).toBeLessThanOrEqual(1)
  })

  it('puts the last sentence in the accent colour and the rest in ink', () => {
    expect(lists(SENTENCES).map((block) => block.tone)).toEqual(['ink', 'ink', 'ink', 'ink', 'accent'])
  })

  it('stacks the sentences down the wall without overlap, centred on it', () => {
    const blocks = lists(SENTENCES)
    for (let i = 1; i < blocks.length; i += 1) {
      const previous = blocks[i - 1]!
      const lastBaseline = previous.at[1] + (previous.items.length - 1) * previous.leading
      expect(blocks[i]!.at[1] - blocks[i]!.size).toBeGreaterThan(lastBaseline)
    }
    const top = blocks[0]!.at[1] - blocks[0]!.size
    const last = blocks.at(-1)!
    const bottom = last.at[1] + (last.items.length - 1) * last.leading
    expect(top).toBeCloseTo(154.06 - bottom, 1)
  })
})
