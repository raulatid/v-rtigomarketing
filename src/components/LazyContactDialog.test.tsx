// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { ContactDialog, preloadContactDialog } from './LazyContactDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The seam itself: the other tests swap it for the component, so this is the
// one that shows the lazy form arrives, and that asking early is harmless.
it('renders the form once its chunk has arrived', async () => {
  preloadContactDialog()
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => {
    root.render(<ContactDialog open idPrefix="lazy" onClose={() => {}} onOpenLegal={() => {}} />)
  })
  await act(async () => {
    await import('./ContactDialog')
  })
  expect(container.querySelector('[role="dialog"] .contact-form')).not.toBeNull()
  act(() => root.unmount())
  container.remove()
})
