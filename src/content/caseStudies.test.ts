import { describe, it, expect } from 'vitest'
import { CASE_STUDIES } from './generated/caseStudies'

// Content invariants for the case-study collection, holding for whatever is in
// the module — hand-written today, emitted by the content build later. The
// generator's validator asserts the same bounds before it writes, so a failure
// here means either a bad hand edit or a validator that let something through.
//
// There was no test for this collection at all, which is why `metrics` being an
// exact two-tuple and `brandColor` being parseable hex were only ever enforced
// by TypeScript — and types are erased at a network boundary.

describe('case study content', () => {
  it('gives every case a distinct id', () => {
    // Assignments name cases by id. A duplicate makes one unreachable and would
    // put the wrong company on an orbit.
    const ids = CASE_STUDIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never ships an empty string where the panel expects text', () => {
    // Sector, location and year are editorial and may be empty; the panel
    // joins whichever are set (CasePanel.tsx).
    for (const entry of CASE_STUDIES) {
      for (const field of ['name', 'summary'] as const) {
        expect(entry[field].trim().length, `${entry.id}.${field}`).toBeGreaterThan(0)
      }
      for (const field of ['sector', 'location', 'year'] as const) {
        expect(typeof entry[field], `${entry.id}.${field}`).toBe('string')
      }
    }
  })

  it('carries at most two metrics, each with text, since the row has two slots', () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.metrics.length, `${entry.id}`).toBeLessThanOrEqual(2)
      for (const metric of entry.metrics) {
        expect(metric.label.trim().length).toBeGreaterThan(0)
        expect(metric.value.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('gives every brandColor as parseable #rrggbb hex', () => {
    // createBrandAtlas parses this with parseInt. Anything else yields
    // rgb(NaN, NaN, NaN), which canvas ignores SILENTLY — the plate does not
    // fail, it comes out the wrong colour.
    for (const entry of CASE_STUDIES) {
      expect(entry.brandColor, `${entry.id}.brandColor`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('gives every chart a renderable series', () => {
    // CaseChart drops a chart whose series is empty or non-finite. That guard is
    // the last line; this is the one that says the content was wrong. A case
    // with nothing to plot has `chart: null` and no block, not a thin chart.
    for (const entry of CASE_STUDIES) {
      if (entry.chart === null) continue
      expect(entry.chart.values.length, `${entry.id}.chart`).toBeGreaterThanOrEqual(2)
      for (const value of entry.chart.values) {
        expect(Number.isFinite(value), `${entry.id}.chart has a non-finite value`).toBe(true)
      }
      expect(['line', 'bars', 'area', 'donut']).toContain(entry.chart.type)
      expect(entry.chart.title.trim().length).toBeGreaterThan(0)
    }
  })

  it('labels every value when a chart shape needs labels', () => {
    // 'bars' draws x-axis ticks and 'donut' a legend from `labels`. A short list
    // renders unlabelled segments rather than failing.
    for (const entry of CASE_STUDIES) {
      if (entry.chart === null) continue
      const { type, values, labels } = entry.chart
      if (type !== 'bars' && type !== 'donut') continue
      expect(labels, `${entry.id}.chart is ${type} and needs labels`).toBeDefined()
      expect(labels!.length, `${entry.id}.chart labels`).toBe(values.length)
    }
  })

  it('keeps a logo either absent or a same-origin path', () => {
    // The media pipeline mirrors CMS uploads into public/logos/ rather than
    // hotlinking them, so a logo is always a local path. An absolute URL here
    // would mean an outbound request from every visitor's browser, and a
    // cross-origin draw that taints the shared atlas.
    for (const entry of CASE_STUDIES) {
      if (entry.logo === null) continue
      expect(entry.logo, `${entry.id}.logo`).toMatch(/^\/[\w./-]+$/)
    }
  })
})
