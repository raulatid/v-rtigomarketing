import { lazy, Suspense, type ComponentProps } from 'react'

const load = () => import('./ContactDialog')
const Dialog = lazy(() => load().then((module) => ({ default: module.ContactDialog })))

/**
 * The contact form waits for the visitor's intent, so a cold `/` does not
 * download it: excluded from the preload loop in vite.config.ts
 * (`isPreloadedOnIndex`, guarded there). The trigger starts the download on
 * hover and focus, so by the click it is usually here; a click that beats it
 * opens the dialog when it lands, and the focus goes in then.
 */
export function preloadContactDialog(): void {
  load().catch(() => {
    // The click's own import tries again, and its failure is the one that shows.
  })
}

export function ContactDialog(props: ComponentProps<typeof Dialog>) {
  return (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  )
}
