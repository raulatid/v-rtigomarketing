// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { StatusOverlay } from './overlays'

// Accessibility audit 2026-11-18, M8: the city's loading line stayed in the
// accessibility tree, with a file path, after the city had loaded.
afterEach(() => document.body.replaceChildren())

describe('the city status overlay', () => {
  it('is a status while loading, an alert on failure, and out of the tree once hidden', () => {
    const overlay = new StatusOverlay(document.body)
    const el = document.getElementById('status-overlay')!
    overlay.setLoading('Cargando la ciudad…')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.hasAttribute('aria-hidden')).toBe(false)
    overlay.hide()
    expect(el.hasAttribute('role')).toBe(false)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    overlay.setError('No se pudo cargar la ciudad')
    expect(el.getAttribute('role')).toBe('alert')
    expect(el.hasAttribute('aria-hidden')).toBe(false)
  })
})
