import fs from 'node:fs'
import { test, expect } from '@playwright/test'

/** The built HTML must be the document served for the public route. */
test('preview serves emitted blog heads and preserves fallback and encoding behavior', async ({ request }) => {
  const post = fs.readdirSync('dist/blog', { withFileTypes: true }).find((entry) => entry.isDirectory())?.name
  expect(post, 'the generated content must include a published article').toBeTruthy()
  const slug = post!
  const encoded = '%' + slug.charCodeAt(0).toString(16) + slug.slice(1)
  for (const [url, file] of [
    ['/blog', 'dist/blog/index.html'],
    ['/blog/?tema=seo', 'dist/blog/index.html'],
    [`/blog/${slug}`, `dist/blog/${slug}/index.html`],
    [`/blog/${slug}/?source=test`, `dist/blog/${slug}/index.html`],
    ['/blog/no-such-post-architecture-check', 'dist/blog.html'],
    [`/blog/${encoded}`, 'dist/blog.html'],
    ['/blog/a%2Fb', 'dist/blog.html'],
  ]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(200)
    expect(await response.text(), url).toBe(fs.readFileSync(file, 'utf8'))
  }
})
