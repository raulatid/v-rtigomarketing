import { lazy, Suspense, type ComponentProps } from 'react'

const Dialog = lazy(() => import('./ClaimDialog').then((module) => ({ default: module.ClaimDialog })))

/**
 * Needed only by the one visitor who holds the final vantage point, so `/`
 * never downloads it: excluded from the preload loop in vite.config.ts. The
 * caller mounts this only while a claim is on offer.
 */
export function ClaimDialog(props: ComponentProps<typeof Dialog>) {
  return (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  )
}
