import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assetMetadata, isPublicAsset, publicationProblems, stripHtmlComments, stripShaderComments, verifyPublication } from './publicationHygiene'
import { blogDocuments } from './publicationPolicy'
import type { BlogPost } from '../src/content/types'

const post: BlogPost = {
  id: 'public-article', title: 'Public article', excerpt: 'Summary', cover: null,
  publishedAt: '2026-08-18T09:00:00.000Z', tags: [], body: [], category: null, readingTime: 1,
  seo: { title: 'Public article', description: 'Summary',
    image: { src: '/og-default.png', alt: 'Vertigo', width: 1200, height: 630 } },
}

describe('publication hygiene', () => {
  it('removes comment nodes, including templates, without altering raw text or attributes', () => {
    const preserved = '<script>const text = "<!--keep-->";</script><style>a::before{content:"<!--keep-->"}</style>' +
      '<p title="<!--keep-->">&lt;!--keep--&gt;</p><textarea><!--keep--></textarea>'
    expect(stripHtmlComments(`<!doctype html><!--internal-->${preserved}<template><!--internal--><b>ok</b></template>`))
      .toBe(`<!doctype html>${preserved}<template><b>ok</b></template>`)
  })

  it('cleans the blog only after its markers have generated article metadata', () => {
    const shell = fs.readFileSync('blog.html', 'utf8').replace('/src/entries/blog.tsx', '/assets/blog-test.js').replace('</head>',
      '<link rel="canonical" href="https://example.com/blog"><meta property="og:url" content="https://example.com/blog"></head>')
    const documents = blogDocuments(shell, [post], 'https://example.com')
    expect(documents.length).toBeGreaterThan(1)
    for (const document of documents) {
      const clean = stripHtmlComments(document.source)
      expect(clean).not.toContain('<!--')
      expect(clean).toContain('rel="canonical"')
      if (document.fileName !== 'blog/index.html') expect(clean).toContain('application/ld+json')
    }
  })

  it('removes every shader comment while preserving tokens and directive lines', () => {
    const shader = '/* one */\n#define FACTOR 2 // two\nfloat/* three\nfour */value;\n/* five */'
    const clean = stripShaderComments(shader)
    expect(clean).not.toMatch(/\/\*|\/\//)
    expect(clean.split('\n')).toHaveLength(shader.split('\n').length)
    expect(clean).toMatch(/float\s+value/)
    expect(clean).toContain('#define FACTOR 2 ')
  })

  it('publishes runtime assets but excludes prototypes, hidden files and source files', () => {
    // content-version.json is the build's own stamp, read by the Studio; any
    // other root-level file is not a URL just because it landed in public/.
    for (const file of ['og-default.png', 'content-version.json', 'models/city.glb', 'textures/lightmaps.json', 'libs/basis/basis_transcoder.js']) {
      expect(isPublicAsset(file), file).toBe(true)
    }
    for (const file of ['proto-sky/a/4096/negx.png', 'textures/sky-test-new.png', 'logos/.gitkeep', 'textures/.env', 'models/raw.blend', 'libs/source.js.map', 'notes.json', 'content-version.txt']) {
      expect(isPublicAsset(file), file).toBe(false)
    }
  })

  it('ships the mirrored favicon and nothing else from media/site', () => {
    expect(isPublicAsset('media/site/abc123-512x512.png')).toBe(true)
    expect(isPublicAsset('media\\site\\abc123-512x512.png')).toBe(true)
    for (const file of ['media/site/.gitkeep', 'media/site/icon.svg', 'media/site/icon.webp', 'media/site/sub/icon.png', 'media/other/icon.png']) {
      expect(isPublicAsset(file), file).toBe(false)
    }
  })

  it('ships the mirrored tower slide pictures and nothing else from media/tower', () => {
    for (const file of ['media/tower/abc123-1024x1536.png', 'media/tower/abc123-800x600.webp', 'media/tower/abc123-800x600.jpg', 'media/tower/abc123-800x600.jpeg', 'media\\tower\\abc123-800x600.png']) {
      expect(isPublicAsset(file), file).toBe(true)
    }
    for (const file of ['media/tower/.gitkeep', 'media/tower/pic.svg', 'media/tower/pic.gif', 'media/tower/sub/pic.png']) {
      expect(isPublicAsset(file), file).toBe(false)
    }
  })

  it('detects copied/generated secret values without including the value in errors', () => {
    const env = { SANITY_TOKEN: 'synthetic-secret-value-for-test' }
    for (const name of ['textures/manifest.json', 'generated/blog-preview.json', 'models/city.glb']) {
      const problems = publicationProblems([{ name, text: env.SANITY_TOKEN }], env, true)
      expect(problems.join()).toContain('SANITY_TOKEN')
      expect(problems.join()).not.toContain(env.SANITY_TOKEN)
    }
  })

  it('rejects local paths, source maps and production diagnostics', () => {
    for (const text of ['{"source":"D:\\\\build\\\\scene.blend"}', '{"source":"/home/editor/scene.blend"}',
      '//# sourceMappingURL=app.js.map', 'window.__vertigoBootDebug={}', '<!-- internal -->']) {
      expect(publicationProblems([{ name: 'index.html', text }], {}, true).length, text).toBeGreaterThan(0)
    }
    expect(publicationProblems([{ name: 'app.js', text: 'window.__vertigoBootDebug={}' }], {}, false)).toEqual([])
  })

  it('checks files added after bundling and refuses a missing build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-publication-'))
    try {
      expect(() => verifyPublication(root, {}, true)).toThrow('missing index.html')
      fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Public</title>')
      expect(() => verifyPublication(root, {}, true)).not.toThrow()
      fs.mkdirSync(path.join(root, 'generated'))
      fs.writeFileSync(path.join(root, 'generated', 'late.json'), '{"source":"/Users/editor/project/file"}')
      expect(() => verifyPublication(root, {}, true)).toThrow('local filesystem path')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects production diagnostics that expose documentation outside the audit folders', () => {
    const files = [{
      name: 'assets/scene.js',
      text: 'console.warn("[brand-atlas] See docs/earth/logo-spec.md.")',
    }]
    expect(publicationProblems(files, {}, true)).toContain('assets/scene.js: internal development notes')
    expect(publicationProblems(files, {}, false)).toEqual([])
    expect(publicationProblems([{
      name: 'assets/scene.js', text: 'console.error("[scene] fatal render error", error)',
    }], {}, true)).toEqual([])
  })

  it('inspects GLB metadata without treating geometry bytes as paths', () => {
    const metadata = Buffer.from('{"asset":{"version":"2.0"},"extras":{"source":"/home/editor/model.blend"}}')
    const glb = Buffer.alloc(20 + metadata.length + 30)
    glb.write('glTF')
    glb.writeUInt32LE(metadata.length, 12)
    glb.writeUInt32LE(0x4e4f534a, 16)
    metadata.copy(glb, 20)
    glb.write('D:\\false-positive', 20 + metadata.length)
    const text = assetMetadata('models/test.glb', glb)
    expect(text).toBe(metadata.toString())
    expect(publicationProblems([{ name: 'models/test.glb', text: glb.toString(), metadataText: text }], {}, true))
      .toContain('models/test.glb: local filesystem path')
    expect(assetMetadata('image.png', Buffer.from('D:\\compressed-pixels'))).toBe('')
    expect(() => assetMetadata('broken.glb', Buffer.alloc(2))).toThrow('invalid GLB')
  })

  it('checks the KTX2 key/value section rather than compressed pixel data', () => {
    const metadata = Buffer.from('source\0/home/editor/texture.png\0')
    const texture = Buffer.alloc(80 + metadata.length + 30)
    Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex').copy(texture)
    texture.writeUInt32LE(80, 56)
    texture.writeUInt32LE(metadata.length, 60)
    metadata.copy(texture, 80)
    texture.write('D:\\false-positive', 80 + metadata.length)
    expect(assetMetadata('texture.ktx2', texture)).toBe('source\n/home/editor/texture.png\n')
    texture.writeUInt32LE(texture.length + 1, 60)
    expect(() => assetMetadata('texture.ktx2', texture)).toThrow('truncated KTX2')
  })
})
