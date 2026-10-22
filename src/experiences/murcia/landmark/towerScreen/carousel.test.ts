import { describe, expect, it } from 'vitest'
import { createCarousel, type Carousel } from './carousel'

// The tower's only clock. Steps of 0.25 s, which binary floating point sums
// exactly, so "after five seconds" means exactly that and not 4.9999.

const STEP = 0.25
const rotation = { compositions: ['tower', 'tower-brand'] as [string, ...string[]], seconds: 5 }

function run(carousel: Carousel, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) carousel.update(STEP)
}

describe('the tower carousel', () => {
  it('plays the first slide in, then turns once it has been settled for the interval', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 2, reducedMotion: false })
    expect(carousel.frame).toEqual({ compositionId: 'tower', progress: 0 })

    run(carousel, 2)
    expect(carousel.frame).toEqual({ compositionId: 'tower', progress: 1 })

    run(carousel, 4.75)
    expect(carousel.frame.compositionId).toBe('tower')
    run(carousel, 0.25)
    // Every later slide arrives settled: the facade crossfades, nothing re-enters.
    expect(carousel.frame).toEqual({ compositionId: 'tower-brand', progress: 1 })

    run(carousel, 5)
    expect(carousel.frame.compositionId).toBe('tower')
  })

  it('never turns during the entrance', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 8, reducedMotion: false })
    run(carousel, 7.75)
    expect(carousel.frame.compositionId).toBe('tower')
  })

  it('starts settled under reduced motion', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 2, reducedMotion: true })
    expect(carousel.frame.progress).toBe(1)
    run(carousel, 5)
    expect(carousel.frame.compositionId).toBe('tower-brand')
  })

  it('holds while not rotating, and resumes from the slide it was sent to', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 2, reducedMotion: true })
    carousel.setRotating(false)
    run(carousel, 20)
    expect(carousel.frame.compositionId).toBe('tower')

    carousel.show('tower-brand')
    carousel.setRotating(true)
    run(carousel, 5)
    expect(carousel.frame.compositionId).toBe('tower')
  })

  it('swaps to a new playlist from its first slide, and ignores the same list again', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 2, reducedMotion: true })
    run(carousel, 5)
    expect(carousel.frame.compositionId).toBe('tower-brand')

    carousel.setPlaylist(['about-1', 'about-2'])
    expect(carousel.frame).toEqual({ compositionId: 'about-1', progress: 1 })
    run(carousel, 2.5)
    carousel.setPlaylist(['about-1', 'about-2'])
    run(carousel, 2.5)
    expect(carousel.frame.compositionId).toBe('about-2')

    carousel.setPlaylist(rotation.compositions)
    expect(carousel.frame.compositionId).toBe('tower')
    run(carousel, 5)
    expect(carousel.frame.compositionId).toBe('tower-brand')
  })

  it('replays the entrance over the seconds asked, and settles at once for none', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 0, reducedMotion: false })
    run(carousel, 1)
    carousel.setPlaylist(['about'])
    carousel.replay(4)
    expect(carousel.frame).toEqual({ compositionId: 'about', progress: 0 })
    run(carousel, 2)
    expect(carousel.frame.progress).toBe(0.5)
    carousel.setPlaylist(rotation.compositions)
    carousel.replay(0)
    expect(carousel.frame).toEqual({ compositionId: 'tower', progress: 1 })
  })

  it('replays nothing under reduced motion', () => {
    const carousel = createCarousel(rotation, { entranceSeconds: 0, reducedMotion: true })
    carousel.replay(4)
    expect(carousel.frame.progress).toBe(1)
  })

  it('never turns with a single slide', () => {
    const carousel = createCarousel(
      { compositions: ['tower'], seconds: 5 },
      { entranceSeconds: 2, reducedMotion: true },
    )
    run(carousel, 30)
    expect(carousel.frame.compositionId).toBe('tower')
  })
})
