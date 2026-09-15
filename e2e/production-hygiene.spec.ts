import fs from 'node:fs'
import { test, expect } from '@playwright/test'

// Opt in with VERCEL_ENV=production for BOTH the build and this test run.
// An ordinary local build intentionally retains the development diagnostics.
test.skip(process.env.VERCEL_ENV !== 'production', 'requires an explicit production build')
test.use({ channel: 'chromium' })

const article = fs.readdirSync('dist/blog', { withFileTypes: true })
  .find((entry) => entry.isDirectory())?.name

for (const route of ['/', '/blog', `/blog/${article}`, '/debug?stats=1&debugNavigation=1']) {
  test(`production has no development output at ${route}`, async ({ page }) => {
    expect(article, 'the build must contain a published article').toBeTruthy()
    const messages: string[] = []
    const errors: string[] = []
    page.on('console', (message) => {
      // Browser interventions and extensions are outside application control.
      // Check every level emitted by same-origin application scripts, including
      // warnings: the original brand-atlas leak used console.warn.
      if (message.location().url.startsWith('http://localhost:4173/')) {
        messages.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(route)

    const assertCleanDocument = async () => {
      const state = await page.evaluate(() => {
        const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT)
        const comments: string[] = []
        while (walker.nextNode()) comments.push(walker.currentNode.nodeValue ?? '')
        return { comments, bootDebug: Boolean(window.__vertigoBootDebug) }
      })
      expect(state.comments).toEqual([])
      expect(state.bootDebug).toBe(false)
    }

    if (route === '/' || route.startsWith('/debug')) {
      await expect(page.locator('.audit-trigger')).toBeAttached({ timeout: 75_000 })
      await assertCleanDocument()
      await page.locator('.nav-control').focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => {
        const host = document.querySelector('.murcia-ui')
        return Boolean(host && getComputedStyle(host).display !== 'none')
      })).toBe(true)
    } else {
      await expect(page.locator('.blog-root')).toBeVisible()
    }

    await assertCleanDocument()
    expect(messages, 'application console output on a successful visit').toEqual([])
    expect(errors, 'uncaught application errors').toEqual([])
  })
}

test('production still reports a genuine loading failure', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/earth/*.ktx2', (route) => route.abort())
  await page.route('**/earth/*.webp', (route) => route.abort())
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => window.__vertigoIntro?.boot.readiness())).toBe('fatal')
  await expect(page.getByText('No se pudo cargar la experiencia')).toBeVisible()
  expect(errors.some((message) => message.includes('[boot] fatal'))).toBe(true)
})
