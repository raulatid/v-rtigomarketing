import { describe, expect, it } from 'vitest'
import {
  createPanelSchedule,
  FIRST_DELAY,
  PAIR_PATIENCE,
  PANEL_SECONDS,
  PANEL_TIMING,
  panelOpacity,
  type ShownPanel,
} from './panelSchedule'

// The schedule is asked a yes/no per satellite and window; these tests answer
// it with plain rules, so what is pinned is the turn-taking, not any sky.

type CanShow = (satellite: number, from: number, to: number) => boolean
const always: CanShow = () => true

/** Every distinct set of panels put up, in order, as "satellite/brand" pairs. */
function run(fps: number, seconds: number, canShow: CanShow, satellites = 8, brands = 5) {
  const schedule = createPanelSchedule(satellites, brands)
  const turns: ShownPanel[][] = []
  let last = ''
  for (let frame = 0; frame <= seconds * fps; frame++) {
    const shown = schedule.update(frame / fps, canShow)
    const key = shown.map((panel) => panel.satellite + '/' + panel.brand).join(',')
    if (key !== last && key !== '') turns.push([...shown])
    last = key
  }
  return turns
}

const brandsOf = (turns: ShownPanel[][]) => turns.flatMap((turn) => turn.map((panel) => panel.brand))

describe('the brand panels schedule', () => {
  it('shows two at a time, and every brand before any comes round again', () => {
    const turns = run(60, 40, always)
    expect(turns.slice(0, 3).map((turn) => turn.length)).toEqual([2, 2, 2])
    expect(brandsOf(turns).slice(0, 10)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4])
  })

  it('moves the panels round the satellites rather than reusing the first ones', () => {
    const satellites = run(60, 40, always).flatMap((turn) => turn.map((panel) => panel.satellite))
    expect(new Set(satellites.slice(0, 8)).size).toBe(8)
  })

  it('waits for the plate, then fades a pair in, holds and fades it out before the next', () => {
    const schedule = createPanelSchedule(2, 2)
    expect(schedule.update(0, always)).toEqual([])
    expect(schedule.update(FIRST_DELAY - 0.01, always)).toEqual([])
    expect(schedule.update(FIRST_DELAY, always).map((panel) => panel.satellite)).toEqual([0, 1])
    expect(schedule.update(FIRST_DELAY + 2, always)[0]!.opacity).toBe(1)
    expect(schedule.update(FIRST_DELAY + PANEL_SECONDS, always)).toEqual([])
    expect(schedule.update(FIRST_DELAY + PANEL_SECONDS + PANEL_TIMING.gap / 2, always)).toEqual([])
  })

  it('only uses satellites that stay in view for the whole panel; one when only one does, none when none does', () => {
    const onlyTwo: CanShow = (satellite, from, to) => satellite === 2 && to - from >= PANEL_SECONDS
    expect(run(60, 12, onlyTwo)[0]!.map((panel) => panel.satellite)).toEqual([2])
    expect(run(60, 12, () => false)).toEqual([])
    // A single brand is never shown twice at once.
    expect(run(60, 12, always, 8, 1)[0]!.length).toBe(1)
  })

  it('holds a lone candidate back when a second will join it within the patience', () => {
    // Satellite 0 is ready from the start; satellite 1 only a second later.
    const late: CanShow = (satellite, from) => satellite === 0 || from >= FIRST_DELAY + 1
    const first = run(60, 8, late)[0]!
    expect(first.map((panel) => panel.satellite)).toEqual([0, 1])

    // Past the patience, the lone one goes up alone.
    const tooLate: CanShow = (satellite, from) => satellite === 0 || from >= FIRST_DELAY + PAIR_PATIENCE + 1
    expect(run(60, 8, tooLate)[0]!.map((panel) => panel.satellite)).toEqual([0])
  })

  it('takes its turns on time, not on frames', () => {
    const at30 = run(30, 40, always).map((turn) => turn.map((panel) => panel.brand))
    const at144 = run(144, 40, always).map((turn) => turn.map((panel) => panel.brand))
    expect(at30).toEqual(at144)
  })

  it('fades in and out over its own timings', () => {
    expect(panelOpacity(0)).toBe(0)
    expect(panelOpacity(PANEL_TIMING.fadeIn / 2)).toBeCloseTo(0.5)
    expect(panelOpacity(PANEL_TIMING.fadeIn + PANEL_TIMING.hold / 2)).toBe(1)
    expect(panelOpacity(PANEL_SECONDS - PANEL_TIMING.fadeOut / 2)).toBeCloseTo(0.5)
    expect(panelOpacity(PANEL_SECONDS)).toBe(0)
  })
})
