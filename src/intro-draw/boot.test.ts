// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { bootState, REQUIRED_IDS, type StepId } from './bootState'

// boot.ts boots on import, so everything it touches has to exist first. jsdom
// has no matchMedia and no SVG geometry — the two stubs below are the whole
// cost of running the real boot entry in a unit test.
const marks: string[] = []

const OPTIONAL: StepId[] = ['satellite:assets', 'murcia:model']

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  // jsdom implements no SVG path geometry; the drawing only needs numbers back.
  Object.assign(window.SVGElement.prototype, {
    getTotalLength: () => 100,
    getPointAtLength: (d: number) => ({ x: d, y: d }),
  })

  vi.spyOn(performance, 'mark').mockImplementation(((name: string) => {
    marks.push(name)
    return undefined as unknown as PerformanceMark
  }) as typeof performance.mark)

  await import('./boot')
})

describe('vertigo:scene-ready', () => {
  it('is marked exactly once, however many notifications follow ready', () => {
    for (const id of REQUIRED_IDS) bootState.markDone(id)
    expect(bootState.readiness()).toBe('ready')
    expect(marks.filter((m) => m === 'vertigo:scene-ready')).toHaveLength(1)

    // The optional resources land after readiness and each one notifies the
    // subscription while `ready` is still latched. That is the regression: the
    // mark used to be re-recorded on every one of them.
    for (const id of OPTIONAL) bootState.markDone(id)
    expect(bootState.readiness()).toBe('ready')
    expect(marks.filter((m) => m === 'vertigo:scene-ready')).toHaveLength(1)
  })
})
