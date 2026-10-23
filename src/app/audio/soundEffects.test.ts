import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_VOICES,
  admitSound,
  createSoundEffects,
  resolveCues,
  type EffectsOutput,
} from './soundEffects'

describe('admitSound', () => {
  it('admits a cue that has never played, or played long enough ago', () => {
    expect(admitSound(undefined, 0, 0.08, 0)).toBe(true)
    expect(admitSound(1, 1.08, 0.08, 0)).toBe(true)
  })

  it('drops a cue repeated inside its interval', () => {
    expect(admitSound(1, 1.05, 0.08, 0)).toBe(false)
  })

  it('drops anything once every voice is taken', () => {
    expect(admitSound(undefined, 0, 0.08, MAX_VOICES)).toBe(false)
    expect(admitSound(undefined, 0, 0.08, MAX_VOICES - 1)).toBe(true)
  })
})

describe('resolveCues', () => {
  it('hears each cue once, in the order asked', () => {
    expect(resolveCues(['a', 'b', 'a'], {})).toEqual(['a', 'b'])
  })

  it('drops a cue another one in the task masks, whichever came first', () => {
    expect(resolveCues(['a', 'b'], { b: ['a'] })).toEqual(['b'])
    expect(resolveCues(['b', 'a'], { b: ['a'] })).toEqual(['b'])
  })

  it('leaves a cue alone when its masker is not in the task', () => {
    expect(resolveCues<'a' | 'b'>(['a'], { b: ['a'] })).toEqual(['a'])
  })
})

/**
 * A stand-in for audioOutput.ts and Web Audio: each "buffer" is the src it was
 * fetched from, so `started` reads as the clips that played, in order.
 */
function fakeOutput() {
  const started: string[] = []
  const sources: { onended: (() => void) | null }[] = []
  let contextListener: ((ctx: AudioContext) => void) | null = null
  const fake = {
    state: 'running',
    currentTime: 0,
    decodeAudioData: (bytes: unknown) => Promise.resolve(bytes),
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect() {},
        disconnect() {},
        start() {
          started.push(source.buffer as string)
        },
      }
      sources.push(source)
      return source
    },
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
  }
  const ctx = fake as unknown as AudioContext
  const control = { silenced: false, hasContext: false }
  const output: EffectsOutput = {
    effectsOutput: () =>
      control.hasContext && !control.silenced ? { ctx, bus: {} as GainNode } : null,
    onSoundContext: (listener) => {
      contextListener = listener
      return () => {}
    },
  }
  return {
    output,
    started,
    sources,
    control,
    fake,
    /** The graph comes into being. */
    open() {
      control.hasContext = true
      contextListener?.(ctx)
    },
  }
}

/** Lets the fetch → decode chain run out. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSoundEffects', () => {
  const effects = { a: { src: 'a.mp3' }, b: { src: 'b.mp3' } }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((src: string) => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(src) })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches nothing until the graph exists, then every listed clip', async () => {
    const audio = fakeOutput()
    createSoundEffects({ effects }, audio.output)
    expect(fetch).not.toHaveBeenCalled()
    audio.open()
    await settle()
    expect(vi.mocked(fetch).mock.calls.map(([src]) => src)).toEqual(['a.mp3', 'b.mp3'])
  })

  it('fetches and decodes a clip shared by two cues once, and plays it for both', async () => {
    const audio = fakeOutput()
    const shared = { src: 'ab.mp3' }
    const play = createSoundEffects({ effects: { a: shared, b: shared } }, audio.output)
    audio.open()
    await settle()
    expect(vi.mocked(fetch).mock.calls.map(([src]) => src)).toEqual(['ab.mp3'])
    play('a')
    play('b')
    await settle()
    expect(audio.started).toEqual(['ab.mp3', 'ab.mp3'])
  })

  it('drops a cue whose clip is not decoded yet, rather than playing it late', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects({ effects }, audio.output)
    audio.open()
    play('a')
    await settle()
    expect(audio.started).toEqual([])
    play('a')
    await settle()
    expect(audio.started).toEqual(['a.mp3'])
  })

  it('drops a cue while the sound is silenced', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects({ effects }, audio.output)
    audio.open()
    await settle()
    audio.control.silenced = true
    play('a')
    await settle()
    expect(audio.started).toEqual([])
  })

  it('stays silent for a cue with no clip', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects<'a' | 'c'>({ effects: { a: { src: 'a.mp3' } } }, audio.output)
    audio.open()
    await settle()
    play('c')
    await settle()
    expect(audio.started).toEqual([])
  })

  it('gives a voice back when its clip ends', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects({ effects }, audio.output)
    audio.open()
    await settle()
    for (let i = 0; i < MAX_VOICES + 1; i++) {
      audio.fake.currentTime += 1
      play('a')
      await settle()
    }
    expect(audio.started).toHaveLength(MAX_VOICES)
    audio.sources[0].onended?.()
    audio.fake.currentTime += 1
    play('b')
    await settle()
    expect(audio.started).toHaveLength(MAX_VOICES + 1)
  })

  it('plays a cue asked for twice in one task once', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects({ effects }, audio.output)
    audio.open()
    await settle()
    play('a')
    play('a')
    await settle()
    expect(audio.started).toEqual(['a.mp3'])
  })

  it('lets a cue mask another asked for in the same task, and only then', async () => {
    const audio = fakeOutput()
    const play = createSoundEffects({ effects, masks: { b: ['a'] } }, audio.output)
    audio.open()
    await settle()
    play('a')
    play('b')
    await settle()
    expect(audio.started).toEqual(['b.mp3'])
    audio.fake.currentTime += 1
    play('a')
    await settle()
    expect(audio.started).toEqual(['b.mp3', 'a.mp3'])
  })
})
