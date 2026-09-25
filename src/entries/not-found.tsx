import { prefersReducedMotion } from '../platform/motionPreference'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NotFoundPage } from '../notFound/NotFoundPage'
import { startVercelInsights } from '../app/vercelInsights'
import { startGoogleAnalytics } from '../app/googleAnalytics'

/**
 * The 404 document's entry point: `404.html` -> here -> `NotFoundPage`.
 *
 * ── Why a third document ──
 *
 * `vercel.json` rewrites three paths and nothing else, so an unknown URL never
 * reaches `index.html`; it reached the platform's bare 404 page. Vercel serves
 * a `404.html` at the root of the build output for exactly that case, WITH
 * status 404 — which a catch-all rewrite to the app could never give (that is a
 * 200, a soft 404, and it would also boot the whole 3D site to say "not here").
 *
 * ── What is NOT in this graph ──
 *
 * The same absences as `entries/blog.tsx`, for the same reason: no `App`, no
 * scene, no intro drawing, no Earth textures. The one piece of three.js on the
 * page — the turning logo — arrives through the blog's dynamic seam
 * (`headerLogoRuntime`), and `checks/architecture.ts` asserts this entry reaches
 * it that way and no other. Not `BlogRoute` either: the route carries every
 * article body, and a page with no articles on it does not pay for them.
 *
 * Leaving is a real navigation to `/`, as from the cold blog: there is no scene
 * behind this document to return to.
 */

// Capture before rendering; late-mounted surfaces reuse this document decision.
prefersReducedMotion()
startVercelInsights()
startGoogleAnalytics()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('[not-found] #root not found in 404.html')

createRoot(rootElement).render(
  <StrictMode>
    <NotFoundPage goHome={() => window.location.assign('/')} />
  </StrictMode>,
)
