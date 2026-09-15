import { lazy, Suspense, type ComponentProps } from 'react'
import type { DocumentPreview } from './DocumentPreview'

// Schema extraction evaluates sanity.config.ts outside Vite. Keep ?raw CSS and
// ?url fonts behind a dynamic import, evaluated only when this view is rendered.
const Preview = lazy(() => import('./DocumentPreview').then((module) => ({default: module.DocumentPreview})))

export function LazyDocumentPreview(props: ComponentProps<typeof DocumentPreview>) {
  return <Suspense fallback={<p role="status" style={{padding: 16}}>Cargando vista previa…</p>}>
    <Preview {...props} />
  </Suspense>
}
