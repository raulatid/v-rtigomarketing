import { lazy, Suspense, type ComponentProps } from 'react'

const Panel = lazy(() => import('./LegalPanel').then(module => ({ default: module.LegalPanel })))

/** Legal copy and preference controls are needed only after an explicit open. */
export function LegalPanel(props: ComponentProps<typeof Panel>) {
  if (!props.doc) return null
  return <Suspense fallback={null}><Panel {...props} /></Suspense>
}
