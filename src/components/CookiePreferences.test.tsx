// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { CookiePreferences } from './CookiePreferences'
import { readConsent, writeConsent } from '../app/consent'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  writeConsent({ preferences: false, analytics: false })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<CookiePreferences />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const press = (text: string) => act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!.click())

it('does not persist a switch until saving and allows preferences without analytics', () => {
  act(() => host.querySelector<HTMLInputElement>('input')!.click())
  expect(readConsent()?.preferences).toBe(false)
  press('Guardar preferencias')
  expect(readConsent()).toMatchObject({ preferences: true, analytics: false })
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Preferencias guardadas')
})
it('supports acceptance, withdrawal and acceptance again', () => {
  press('Aceptar todas')
  expect(readConsent()).toMatchObject({ preferences: true, analytics: true })
  press('Rechazar todas')
  expect(readConsent()).toMatchObject({ preferences: false, analytics: false })
  expect(Array.from(host.querySelectorAll('input')).every(i => !i.checked)).toBe(true)
  press('Aceptar todas')
  expect(Array.from(host.querySelectorAll('input')).every(i => i.checked)).toBe(true)
})
it('discards unsaved edits when reopened and follows external changes', () => {
  act(() => host.querySelector<HTMLInputElement>('input')!.click())
  act(() => root.render(null))
  act(() => root.render(<CookiePreferences />))
  expect(host.querySelector<HTMLInputElement>('input')!.checked).toBe(false)
  act(() => writeConsent({ preferences: false, analytics: true }))
  expect(host.querySelectorAll('input')[1].checked).toBe(true)
})
