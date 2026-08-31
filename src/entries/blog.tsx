import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BlogRoute from '../blog/BlogRoute'
import { useRoute } from '../app/useRoute'

/**
 * The cold blog's entry point: `blog.html` -> here -> `BlogRoute`.
 *
 * ── What is NOT in this graph, and why that is the whole point ──
 *
 * No `App`, no `LazyScene`, no three.js, no intro drawing, no Earth textures, no
 * navigation gesture, no custom cursor. Someone who arrives at `/blog` from a
 * search result or a shared link pays for an article and nothing else. That is a
 * fact about the module graph rather than a set of guards, and
 * `checks/architecture.ts` asserts it: nothing reachable from this file may
 * reach `src/experiences/` or `src/graphics/`.
 *
 * Not `styles.css` either. The 3D site's stylesheet is never loaded here, which
 * is one of the two independent reasons a blog visit cannot change the scene's
 * typography — the other, and the one that matters in a WARM session where both
 * sheets are live at once, is that the blog's font families are named for the
 * blog.
 *
 * ── This entry is a second Rollup input ──
 *
 * So a static import of the blog from here is legal by construction, while the
 * same import from `src/main.tsx` is forbidden. Two entries, two rules, one
 * shared component.
 */

/**
 * Leaving a cold blog is a real navigation, deliberately.
 *
 * There is no scene behind this document to return to — no Canvas, no city, no
 * intro that has already run — so there is nothing a client-side transition
 * could preserve. `location.assign` costs a page load the reader was going to
 * pay for anyway, and lands them on the site's front door with its intro intact.
 *
 * The WARM host does the opposite for the same reason: there, a page load would
 * destroy a scene that is sitting ready. Which of the two applies is decided by
 * which document is running, never by inspecting history.
 */
function BlogApp() {
  const nav = useRoute()

  // THIS DOCUMENT IS THE BLOG, so it renders the blog even when the URL does not
  // parse as one. `parseRoute` answers "which page does this path name" for an
  // application that has both; here the answer can only be the index, and
  // rendering nothing because someone reached `/blog.html` directly — or because
  // a rewrite was misconfigured — would be a blank page with no error.
  const route = nav.route.name === 'site' ? ({ name: 'blog-index', topic: null } as const) : nav.route

  return (
    <BlogRoute
      route={route}
      host={{
        exitToScene: () => window.location.assign('/'),
        openPost: nav.openPost,
        returnToIndex: nav.returnToIndex,
        replaceTopic: nav.replaceTopic,
        rememberScroll: nav.rememberScroll,
        storedScrollTop: nav.storedScrollTop,
      }}
    />
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('[blog] #root not found in blog.html')

createRoot(rootElement).render(
  <StrictMode>
    <BlogApp />
  </StrictMode>,
)
