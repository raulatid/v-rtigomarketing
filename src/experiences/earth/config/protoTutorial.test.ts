import { describe, expect, it } from 'vitest'
import { parseProtoTutorialParams } from './protoTutorial'

// `__VERTIGO_ENV__` is 'development' under vitest, so the gate is consultable
// here; the production case is that the flag folds the parser away entirely.

describe('the hover tutorial gate', () => {
  it('is inert without the flag', () => {
    expect(parseProtoTutorialParams('')).toEqual({ loop: false })
    expect(parseProtoTutorialParams('?holo=1')).toEqual({ loop: false })
    expect(parseProtoTutorialParams('?tutorial=0')).toEqual({ loop: false })
  })

  it('loops with ?tutorial=1', () => {
    expect(parseProtoTutorialParams('?tutorial=1')).toEqual({ loop: true })
    expect(parseProtoTutorialParams('?holo=1&tutorial=1')).toEqual({ loop: true })
  })
})
