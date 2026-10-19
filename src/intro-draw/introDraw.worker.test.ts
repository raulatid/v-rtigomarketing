// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntroDraw, type IntroDrawHandle } from './introDraw'
import type { DrawTick } from './drawLoop'
import type { FromDrawWorker, ToDrawWorker } from './drawWorker'
import type { Readiness } from './playhead'

// The host side of the worker drawing (ADR 016 item 3). The worker itself
// paints into an OffscreenCanvas, which jsdom does not have; what is asserted
// here is everything this thread owns: what it posts, what it believes about
// the drawing, and the hand-over to the SVG when the worker cannot draw.

class FakeWorker {
  static last: FakeWorker | null = null
  posted: ToDrawWorker[] = []
  transferred: unknown[] = []
  terminated = false
  onmessage: ((event: MessageEvent<FromDrawWorker>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  constructor() {
    FakeWorker.last = this
  }
  postMessage(message: ToDrawWorker, transfer: unknown[] = []) {
    this.posted.push(message)
    this.transferred.push(...transfer)
  }
  terminate() {
    this.terminated = true
  }
  send(data: FromDrawWorker) {
    this.onmessage?.({ data } as MessageEvent<FromDrawWorker>)
  }
}

const tick = (overrides: Partial<DrawTick> = {}): DrawTick => ({
  visual: 0.3,
  holding: false,
  pulse: null,
  caption: 'loading',
  revealed: false,
  notice: false,
  done: false,
  trace: null,
  ...overrides,
})

let progress = 0
let readiness: Readiness = 'loading'
let completed = 0
let firstFrames: number[] = []
let handle: IntroDrawHandle
const worker = () => FakeWorker.last!

function create(options: { quiet?: boolean } = {}) {
  handle = createIntroDraw({
    getProgress: () => progress,
    getReadiness: () => readiness,
    onComplete: () => {
      completed += 1
    },
    onFirstFrame: (t) => firstFrames.push(t),
    ...options,
  })
}

beforeAll(() => {
  Object.assign(window.SVGElement.prototype, {
    getTotalLength: () => 100,
    getPointAtLength: (d: number) => ({ x: d, y: d }),
  })
})

beforeEach(() => {
  progress = 0
  readiness = 'loading'
  completed = 0
  firstFrames = []
  FakeWorker.last = null
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('OffscreenCanvasRenderingContext2D', function OffscreenCanvasRenderingContext2D() {})
  Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
    configurable: true,
    value: () => ({ offscreen: true }),
  })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  handle.destroy()
  vi.unstubAllGlobals()
  delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen
})

describe('drawing in the worker', () => {
  it('hands the worker the canvas and everything it needs to start, and draws nothing here', () => {
    readiness = 'starting'
    create({ quiet: true })
    expect(handle.mark.tagName).toBe('CANVAS')
    expect(handle.mark.classList.contains('intro-mark')).toBe(true)
    expect(handle.root.querySelector('svg')).toBeNull()
    expect(handle.isVisible()).toBe(false)

    const start = worker().posted[0]
    expect(start).toMatchObject({ type: 'start', quiet: true, readiness: 'starting', load: 0 })
    expect(worker().transferred).toEqual([{ offscreen: true }])
    // Only the draw config crosses: setConfig is handed the app's whole config.
    expect(Object.keys((start as { config: object }).config).sort()).toEqual(
      Object.keys(handle.getConfig()).sort(),
    )
  })

  it('posts its inputs when they change, and only then', () => {
    create()
    worker().send({ type: 'frame', generation: 0, tick: tick() })
    expect(worker().posted.filter((m) => m.type === 'inputs')).toHaveLength(0)

    progress = 0.4
    worker().send({ type: 'frame', generation: 0, tick: tick() })
    worker().send({ type: 'frame', generation: 0, tick: tick() })
    readiness = 'ready'
    worker().send({ type: 'frame', generation: 0, tick: tick() })
    expect(worker().posted.filter((m) => m.type === 'inputs')).toEqual([
      { type: 'inputs', load: 0.4, readiness: 'loading' },
      { type: 'inputs', load: 0.4, readiness: 'ready' },
    ])
  })

  it('believes the worker about the playhead, the caption and the ending', () => {
    create()
    worker().send({ type: 'frame', generation: 0, tick: tick({ visual: 0.5, holding: true, caption: 'almost' }) })
    expect(handle.playhead()).toBe(0.5)
    expect(handle.isHolding()).toBe(true)
    expect(handle.root.querySelector('.intro-caption')!.textContent).toBe('Casi listo')
    expect(completed).toBe(0)

    worker().send({ type: 'frame', generation: 0, tick: tick({ visual: 1, done: true }) })
    expect(handle.isDone()).toBe(true)
    expect(completed).toBe(1)
  })

  it('shows the mark when the worker ends a quiet wait', () => {
    create({ quiet: true })
    worker().send({ type: 'frame', generation: 0, tick: tick({ revealed: true }) })
    expect(handle.isVisible()).toBe(true)
  })

  it('drops frames the worker posted before a seek, so a snapped drawing cannot complete again', () => {
    create()
    handle.snapToEnd()
    expect(worker().posted.at(-1)).toEqual({ type: 'snap', generation: 1 })
    expect(handle.isDone()).toBe(true)

    // In flight when the seek happened: it must not fire a completion.
    worker().send({ type: 'frame', generation: 0, tick: tick({ visual: 1, done: true }) })
    expect(completed).toBe(0)

    handle.replay()
    expect(worker().posted.at(-1)).toEqual({ type: 'replay', generation: 2 })
    expect(handle.isDone()).toBe(false)
    worker().send({ type: 'frame', generation: 2, tick: tick({ visual: 1, done: true }) })
    expect(completed).toBe(1)
  })

  it('records the first painted frame in this thread’s clock, once', () => {
    create()
    const at = performance.timeOrigin + 1234
    worker().send({ type: 'painted', at })
    worker().send({ type: 'painted', at: at + 500 })
    expect(firstFrames).toHaveLength(1)
    expect(firstFrames[0]).toBeCloseTo(1234, 3)
  })

  it('applies the tail’s scale and blur to the canvas', () => {
    create()
    handle.setScale(0.5)
    handle.setWarp(3, 0.25)
    expect(handle.mark.style.getPropertyValue('--intro-scale')).toBe('0.5')
    expect(handle.mark.style.getPropertyValue('--intro-warp')).toBe('1.25')
    expect(handle.mark.style.filter).toBe('blur(3.00px)')
  })
})

describe('when the worker cannot draw', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('draws the SVG instead when the worker has no 2D context', () => {
    create({ quiet: true })
    const first = worker()
    first.send({ type: 'unsupported' })
    expect(first.terminated).toBe(true)
    expect(handle.mark.tagName.toLowerCase()).toBe('svg')
    expect(handle.root.querySelector('canvas')).toBeNull()
    // Still quiet: falling back changes the renderer, not what is shown.
    expect(handle.isVisible()).toBe(false)
  })

  it('draws the SVG instead when the worker fails', () => {
    create()
    const first = worker()
    first.onerror?.({ message: 'boom', preventDefault() {} } as ErrorEvent)
    expect(first.terminated).toBe(true)
    expect(handle.mark.tagName.toLowerCase()).toBe('svg')
    // Nothing the dead worker sends afterwards counts.
    first.send({ type: 'frame', generation: 0, tick: tick({ done: true }) })
    expect(completed).toBe(0)
  })

  it('draws the SVG when the browser has no OffscreenCanvas 2D at all', () => {
    vi.stubGlobal('OffscreenCanvasRenderingContext2D', undefined)
    create()
    expect(FakeWorker.last).toBeNull()
    expect(handle.mark.tagName.toLowerCase()).toBe('svg')
  })
})
