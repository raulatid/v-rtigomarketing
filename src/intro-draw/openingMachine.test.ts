import { describe, it, expect } from 'vitest'
import {
  admits,
  canSubstitute,
  createOpening,
  next,
  tail,
  type Opening,
  type OpeningEvent,
  type Presentation,
  type Way,
  type WorkKind,
} from './openingMachine'

// ADR 016's tables, as tables. Whether the tail walks the page's opening in
// this order is the timeline's test (`useMasterTimeline.test.tsx`).

const ready: OpeningEvent = { type: 'readiness', readiness: 'ready' }
const fill: OpeningEvent = { type: 'fill' }
const elapsed: OpeningEvent = { type: 'elapsed' }

function start(way: Way): Opening {
  return createOpening({ returning: way === 'returning', reducedMotion: way === 'reduced' })
}

function run(state: Opening, events: OpeningEvent[]): Opening {
  return events.reduce(next, state)
}

/** Every presentation state a way passes through, from a ready fill to rest. */
function walk(way: Way): Presentation[] {
  let state = run(start(way), [ready])
  const seen: Presentation[] = [state.presentation]
  state = next(state, fill)
  while (seen[seen.length - 1] !== state.presentation) {
    seen.push(state.presentation)
    state = next(state, elapsed)
  }
  return seen
}

describe('the ways in', () => {
  it.each<[Way, Presentation[]]>([
    ['first', ['draw', 'shrink', 'warp', 'swap', 'corner', 'orbits', 'site']],
    ['returning', ['draw', 'shrink', 'swap', 'corner', 'orbits', 'site']],
    ['reduced', ['draw', 'site']],
  ])('%s', (way, expected) => {
    expect(walk(way)).toEqual(expected)
  })

  it('reduced motion wins over a returning visitor', () => {
    expect(createOpening({ returning: true, reducedMotion: true }).way).toBe('reduced')
  })
})

describe('draw → shrink requires the required steps (§26.5)', () => {
  it.each(['starting', 'loading', 'fatal'] as const)('a fill under %s readiness is refused', (readiness) => {
    const state = run(start('first'), [{ type: 'readiness', readiness }, fill])
    expect(state.presentation).toBe('draw')
  })

  it('draw never ends on time', () => {
    expect(run(start('first'), [ready, elapsed]).presentation).toBe('draw')
  })

  it('fatal latches, as bootState does', () => {
    const state = run(start('first'), [{ type: 'readiness', readiness: 'fatal' }, ready, fill])
    expect(state.readiness).toBe('fatal')
    expect(state.presentation).toBe('draw')
  })

  it('a second fill does not skip a phase', () => {
    expect(run(start('first'), [ready, fill, fill]).presentation).toBe('shrink')
  })
})

describe('site is the rest state', () => {
  it('stays there', () => {
    const state = run(start('first'), [ready, fill, ...Array(10).fill(elapsed)])
    expect(state.presentation).toBe('site')
    expect(next(state, elapsed)).toBe(state)
  })
})

describe('the substitution requires the logo (§26.8)', () => {
  const atSwap = run(start('first'), [ready, fill, elapsed, elapsed])

  it('is refused without a model', () => {
    expect(atSwap.presentation).toBe('swap')
    expect(canSubstitute(atSwap)).toBe(false)
  })

  it('is allowed with one, and only in swap', () => {
    expect(canSubstitute(next(atSwap, { type: 'logo-ready' }))).toBe(true)
    expect(canSubstitute(run(start('first'), [{ type: 'logo-ready' }]))).toBe(false)
  })
})

describe('replay', () => {
  it('returns to draw and takes the whole tail, whatever returning said', () => {
    const landed = run(start('returning'), [ready, fill, elapsed, elapsed, elapsed, elapsed])
    expect(landed.presentation).toBe('site')
    const replayed = next(landed, { type: 'replay' })
    expect(replayed.presentation).toBe('draw')
    expect(replayed.way).toBe('first')
    expect(next(replayed, fill).presentation).toBe('shrink')
    expect(run(replayed, [fill, elapsed]).presentation).toBe('warp')
  })

  it('keeps reduced motion reduced', () => {
    const replayed = run(start('reduced'), [ready, fill, { type: 'replay' }])
    expect(replayed.way).toBe('reduced')
    expect(next(replayed, fill).presentation).toBe('site')
  })
})

describe('rewind', () => {
  it.each<[Way, Presentation]>([
    ['first', 'shrink'],
    ['returning', 'shrink'],
    ['reduced', 'site'],
  ])('puts %s back at its first phase after draw', (way, first) => {
    const landed = run(start(way), [ready, fill, ...Array(10).fill(elapsed)])
    expect(landed.presentation).toBe('site')
    const rewound = next(landed, { type: 'rewind' })
    expect(rewound.presentation).toBe(first)
    expect(tail(rewound)[0]).toBe(first)
  })

  it('never takes the opening out of draw', () => {
    const drawing = run(start('first'), [ready])
    expect(next(drawing, { type: 'rewind' })).toBe(drawing)
  })
})

describe('events that change nothing return the same state', () => {
  it.each<OpeningEvent>([
    { type: 'readiness', readiness: 'starting' },
    { type: 'rewind' },
    elapsed,
    fill,
  ])('%o', (event) => {
    const state = start('first')
    expect(next(state, event)).toBe(state)
  })
})

describe('the work rule (ADR 016)', () => {
  const MAIN: Record<Presentation, boolean> = {
    draw: true,
    shrink: false,
    warp: false,
    swap: false,
    corner: false,
    orbits: false,
    site: true,
  }
  const PRESENTATIONS = Object.keys(MAIN) as Presentation[]

  it.each(PRESENTATIONS)('%s', (presentation) => {
    const row: Record<WorkKind, boolean> = {
      network: admits({ presentation }, 'network'),
      worker: admits({ presentation }, 'worker'),
      main: admits({ presentation }, 'main'),
      gpu: admits({ presentation }, 'gpu'),
    }
    expect(row).toEqual({ network: true, worker: true, main: MAIN[presentation], gpu: MAIN[presentation] })
  })
})
