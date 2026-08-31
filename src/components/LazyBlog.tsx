import { Suspense, lazy } from 'react'
import type { BlogHost } from '../blog/BlogRoute'
import type { Route } from '../app/route'

/**
 * The seam between the 3D application and the blog.
 *
 * THIS FILE IS THE BOUNDARY, and it is deliberately almost empty. Everything the
 * blog needs — the UI, the serializer, the stylesheet and the whole generated
 * dataset — hangs off the `import()` below, so none of it is statically
 * reachable from `src/main.tsx`. A static import would put every article body
 * on the initial load of `/` — the closure `vite.config.ts` budgets with
 * INITIAL_JS_BUDGET_BYTES — and it grows with the article library rather than
 * with the code.
 *
 * `checks/architecture.ts` asserts both halves: that nothing static reaches the
 * blog from the app entry, and — the guard on the guard — that something dynamic
 * does. Without the second, renaming `BlogRoute.tsx` would make the first rule
 * vacuously true and the check would go green on a blog that no longer exists.
 *
 * No `Suspense` FALLBACK on purpose. The chunk is `modulepreload`ed at low
 * priority alongside the scene chunks, so by the time a reader taps the building
 * it is nearly always already fetched; a spinner that flashes for one frame is
 * worse than a frame of the scene the reader was already looking at. The scene
 * behind is still painted at this point — it is hidden by the wrapper only once
 * the route has actually changed.
 */
const BlogRoute = lazy(() => import('../blog/BlogRoute'))

interface Props {
  route: Route
  host: BlogHost
}

export function LazyBlog({ route, host }: Props) {
  if (route.name === 'site') return null
  return (
    <Suspense fallback={null}>
      <BlogRoute route={route} host={host} />
    </Suspense>
  )
}
