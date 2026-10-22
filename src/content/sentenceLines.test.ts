import { describe, expect, it } from 'vitest'
import { sentenceFits, wrapSentence } from './sentenceLines'

describe('the lines a screen sentence breaks into', () => {
  it('fills each line greedily and cuts only at spaces', () => {
    expect(wrapSentence('Estrategia, marca y datos.', 15)).toEqual(['Estrategia,', 'marca y datos.'])
    expect(wrapSentence('Desde Murcia al mundo.', 15)).toEqual(['Desde Murcia al', 'mundo.'])
  })

  it('reads runs of whitespace as one space', () => {
    expect(wrapSentence('  Somos   Vértigo. ', 15)).toEqual(['Somos Vértigo.'])
    expect(wrapSentence('', 15)).toEqual([])
  })

  it('leaves a word longer than a line on a line of its own, for the caller to refuse', () => {
    expect(wrapSentence('Hiperespecialización total', 15)).toEqual(['Hiperespecialización', 'total'])
    expect(sentenceFits('Hiperespecialización total', 15, 2)).toBe(false)
  })

  it('fits what breaks into at most the lines allowed, each within its width', () => {
    expect(sentenceFits('Más de 12 años creciendo.', 15, 2)).toBe(true)
    expect(sentenceFits('Desde Murcia, para todo el mundo.', 15, 2)).toBe(false)
    expect(sentenceFits('   ', 15, 2)).toBe(false)
  })
})
