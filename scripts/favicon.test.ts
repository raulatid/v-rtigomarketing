import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// The site and the blog are two HTML documents, and the cold blog shells are
// copies of the second. Each declared its own favicon, so one site showed two
// marks (architecture audit 2026-09-02, P2-E). These keep them one.

// The isotype's two paths, as `MarkPaths` in src/blog/BlogHeaderLogo.tsx draws them.
const MARK_PATHS = [
  'M33.7 13.6 7.7 39.4l4.7 3.4c92.3 67.2 193 82.8 292.7 45.5 30.2-11.3 63.8-30.1 85-47.4L354.1.2l-3.4 2.3c-37.9 26-78.1 42.2-118.4 47.7-19.1 2.6-39.4 2.9-58.5.7-26.4-3-52.3-10.2-77.5-21.7C79.3 21.5 62.2 11.4 49.9 1.8L47.5 0Z',
  'M34.5 99.7 168.6 399.5h62.5L365 99.7l-6 2.9c-20.4 10.2-45.7 20.3-65.4 26l-2.5.9-45.5 101.1-45.4 101.2-45.6-101.1L109.1 129.3l-1.7-.3c-13.6-2.4-43.2-14.2-69.4-27.7Z',
]

function iconHref(file: string): string {
  const html = fs.readFileSync(file, 'utf8')
  const icons = [...html.matchAll(/<link\s+rel="icon"\s+href="([^"]+)"/g)]
  expect(icons, `${file} declares exactly one icon`).toHaveLength(1)
  return icons[0][1]
}

describe('the favicon', () => {
  it('is the same in the site, the blog and the 404 page', () => {
    expect(iconHref('blog.html')).toBe(iconHref('index.html'))
    expect(iconHref('404.html')).toBe(iconHref('index.html'))
  })

  it('is the isotype the blog header draws', () => {
    const href = decodeURIComponent(iconHref('index.html'))
    for (const d of MARK_PATHS) expect(href).toContain(`d='${d}'`)
  })
})
