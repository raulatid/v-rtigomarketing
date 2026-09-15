// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import type { VertigoIntro } from './boot'
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

describe('standalone boot environment', () => {
  it.each([undefined, 'development', 'production'])('boots with environment %s', (environment) => {
    // Bundle outside Vitest so its define cannot hide a missing browser global.
    const options = {
      entryPoints: ['src/intro-draw/boot.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      define: environment === undefined ? {} : { __VERTIGO_ENV__: JSON.stringify(environment) },
    }
    // esbuild needs Node's typed arrays, which jsdom replaces in this process.
    const code = execFileSync(process.execPath, [
      '-e',
      "process.stdout.write(require('esbuild').buildSync(JSON.parse(process.argv[1])).outputFiles[0].text)",
      JSON.stringify(options),
    ], { encoding: 'utf8' })
    const bootWindow = {
      matchMedia: window.matchMedia,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      __vertigoIntro: undefined as VertigoIntro | undefined,
      __vertigoBootDebug: undefined as unknown,
    }
    try {
      runInNewContext(code, {
        window: bootWindow,
        document,
        performance,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
      })
      expect(bootWindow.__vertigoIntro).toBeDefined()
      expect(bootWindow.__vertigoIntro!.handle.root.isConnected).toBe(true)
      expect(Boolean(bootWindow.__vertigoBootDebug)).toBe(environment !== 'production')
    } finally {
      bootWindow.__vertigoIntro?.handle.destroy()
    }
  })
})
