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
 * No `Suspense` fallback: the city prefetches this route when the approach
 * starts, before navigation. The existing transition cover waits for the blog
 * to paint on slower connections. Cold `/` does not preload the blog route.
 */
const loadBlogRoute = () => import('../blog/BlogRoute')

const BlogRoute = lazy(loadBlogRoute)

/**
 * Starts the blog's chunk fetching without rendering anything.
 *
 * Called when the blog display's approach COMMITS, three seconds before the
 * route actually changes. This starts the request on visitor intent rather
 * than competing with scene resources at boot. On a slow connection the
 * transition cover holds until the blog paints.
 *
 * Deliberately the SAME specifier as the `lazy` above, byte for byte, so the
 * two share one chunk and one module instance. It is also what keeps the second
 * half of `checks/architecture.ts`'s pair of blog rules honest: the dynamic
 * edge it looks for is still here.
 *
 * Failures are swallowed. Nothing is waiting on this — the `lazy` boundary
 * fetches again on render and reports properly there — and an unhandled
 * rejection from a speculative prefetch would be noise on a path that has
 * already recovered.
 */
export function prefetchBlog(): void {
  void loadBlogRoute().catch(() => {})
}

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
