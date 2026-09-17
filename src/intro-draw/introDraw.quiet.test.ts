// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntroDraw, type IntroDrawHandle } from './introDraw'
import { DRAW_TIMING } from './drawConfig'
import type { Readiness } from './playhead'

// The returning visitor's wait: unseen, and over the moment the scene is ready.
//
// Frames are pumped by hand. The drawing measures real seconds between rAF
// timestamps, so handing it timestamps is handing it time.

let frames: FrameRequestCallback[] = []
let now = 0
let readiness: Readiness = 'loading'
let completed = 0
let handle: IntroDrawHandle

/** Advances `seconds` in 60 Hz frames, running whichever loop re-armed itself. */
function run(seconds: number) {
  const end = now + seconds * 1000
  while (now < end) {
    now += 1000 / 60
    const due = frames
    frames = []
    for (const fn of due) fn(now)
    if (due.length === 0) break
  }
}

function create(options: { quiet: boolean; reducedMotion?: boolean }) {
  handle = createIntroDraw({
    getProgress: () => 1,
    getReadiness: () => readiness,
    onComplete: () => {
      completed += 1
    },
    ...options,
  })
}

beforeAll(() => {
  // jsdom implements no SVG path geometry; the drawing only needs numbers back.
  Object.assign(window.SVGElement.prototype, {
    getTotalLength: () => 100,
    getPointAtLength: (d: number) => ({ x: d, y: d }),
  })
})

beforeEach(() => {
  frames = []
  now = 0
  readiness = 'loading'
  completed = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn))
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
})

afterEach(() => {
  handle.destroy()
  vi.unstubAllGlobals()
})

const caption = () => handle.root.querySelector('.intro-caption')!

describe('a quiet wait', () => {
  it('never shows the mark, and ends the moment the scene is ready — no floor', () => {
    create({ quiet: true })
    expect(handle.isVisible()).toBe(false)
    run(0.4)
    expect(completed).toBe(0)
    readiness = 'ready'
    run(0.05)
    // Well inside `minimumDuration`: there is nothing on screen for it to protect.
    expect(now / 1000).toBeLessThan(DRAW_TIMING.minimumDuration / 2)
    expect(completed).toBe(1)
    expect(handle.isDone()).toBe(true)
    expect(handle.isVisible()).toBe(false)
  })

  it('says nothing while it is unseen', () => {
    create({ quiet: true })
    run(1)
    expect(caption().classList.contains('is-visible')).toBe(false)
  })

  it('still waits for readiness: a quiet wait is not a shortcut past loading', () => {
    create({ quiet: true })
    run(DRAW_TIMING.quietGrace - 0.2)
    expect(completed).toBe(0)
  })

  it('shows the drawing after all once the grace runs out, and the floor applies again', () => {
    create({ quiet: true })
    run(DRAW_TIMING.quietGrace + 0.2)
    expect(handle.isVisible()).toBe(true)
    expect(completed).toBe(0)
    // From here it is an ordinary drawing: readiness lets it finish, and it does.
    readiness = 'ready'
    run(DRAW_TIMING.minimumDuration + 2)
    expect(completed).toBe(1)
    expect(handle.isVisible()).toBe(true)
  })

  it('shows itself on a fatal load, because that is when there is something to say', () => {
    create({ quiet: true })
    run(0.2)
    readiness = 'fatal'
    run(0.2)
    expect(handle.isVisible()).toBe(true)
    expect(caption().classList.contains('is-visible')).toBe(true)
    expect(completed).toBe(0)
  })

  it('holds under reduced motion too', () => {
    create({ quiet: true, reducedMotion: true })
    expect(handle.isVisible()).toBe(false)
    readiness = 'ready'
    run(0.1)
    expect(completed).toBe(1)
    expect(handle.isVisible()).toBe(false)
  })

  it('is over for good once someone asks to see the drawing', () => {
    create({ quiet: true })
    handle.replay()
    expect(handle.isVisible()).toBe(true)
    readiness = 'ready'
    run(0.5)
    // A replay keeps the three-second contract; quiet would have ended it here.
    expect(completed).toBe(0)
  })
})

describe('a first visit is untouched', () => {
  it('shows the mark from the first frame and keeps its floor', () => {
    create({ quiet: false })
    expect(handle.isVisible()).toBe(true)
    readiness = 'ready'
    run(DRAW_TIMING.minimumDuration - 0.5)
    expect(completed).toBe(0)
    run(3)
    expect(completed).toBe(1)
  })
})
