import fs from 'node:fs'
import path from 'node:path'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { findSecretLeaks, publicPrefixedSecrets, scannableSecrets } from './secretScan'

function commentRanges(html: string): Array<{ startOffset: number; endOffset: number }> {
  const ranges: Array<{ startOffset: number; endOffset: number }> = []
  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if (node.nodeName === '#comment' && node.sourceCodeLocation) ranges.push(node.sourceCodeLocation)
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('content' in node) visit(node.content)
  }
  visit(parse(html, { sourceCodeLocationInfo: true }))
  return ranges.sort((a, b) => b.startOffset - a.startOffset)
}

// Remove actual comment nodes, preserving raw-text elements, attributes and all
// other bytes. Run AFTER the blog generator has consumed its SEO markers.
export function stripHtmlComments(html: string): string {
  for (const { startOffset, endOffset } of commentRanges(html)) {
    html = html.slice(0, startOffset) + html.slice(endOffset)
  }
  return html
}

// GLSL has no string literals. Preserve line breaks and token separation,
// including preprocessor directives; JS minifiers cannot clean shader strings.
export function stripShaderComments(shader: string): string {
  return shader.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (comment) => comment.replace(/[^\r\n]/g, ' '))
}

const PUBLIC_ROOTS = new Set(['audio', 'draco', 'earth', 'fonts', 'libs', 'logos', 'models', 'textures'])
const PUBLIC_EXTENSIONS = new Set(['.mp3', '.js', '.wasm', '.ktx2', '.woff2', '.glb', '.png', '.webp', '.avif', '.json', '.svg'])

export function isPublicAsset(file: string): boolean {
  const parts = file.replace(/\\/g, '/').split('/')
  if (parts.some((part) => part.startsWith('.') || part.startsWith('sky-test-'))) return false
  return file === 'og-default.png' || (
    PUBLIC_ROOTS.has(parts[0]) && PUBLIC_EXTENSIONS.has(path.extname(file))
  )
}

export function listFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    // Never follow links out of the publication directory.
    if (entry.isSymbolicLink()) throw new Error(`[publication] symbolic link refused: ${entry.name}`)
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? listFiles(file) : [file]
  })
}

export interface PublishedAsset { name: string; text: string; metadataText?: string }

export function assetMetadata(name: string, bytes: Buffer): string {
  if (name.endsWith('.glb')) {
    if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(16) !== 0x4e4f534a) {
      throw new Error(`[publication] invalid GLB: ${name}`)
    }
    const end = 20 + bytes.readUInt32LE(12)
    if (end > bytes.length) throw new Error(`[publication] truncated GLB: ${name}`)
    return bytes.toString('utf8', 20, end)
  }
  if (name.endsWith('.ktx2')) {
    // KTX2 key/value section, matching the header read by three's ktx-parse.
    if (bytes.length < 80 || !bytes.subarray(0, 12).equals(Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex'))) {
      throw new Error(`[publication] invalid KTX2: ${name}`)
    }
    const start = bytes.readUInt32LE(56)
    const end = start + bytes.readUInt32LE(60)
    if (end > bytes.length) throw new Error(`[publication] truncated KTX2: ${name}`)
    return bytes.toString('utf8', start, end).replace(/\0/g, '\n')
  }
  return /\.(?:html|css|js|json|txt|xml|svg|map)$/.test(name) ? bytes.toString('utf8') : ''
}

export function publicationProblems(
  files: readonly PublishedAsset[],
  env: Record<string, string | undefined>,
  production: boolean,
): string[] {
  const problems = publicPrefixedSecrets(env).map((name) => `${name}: credential uses a public prefix`)
  for (const leak of findSecretLeaks(files, scannableSecrets(env))) {
    problems.push(`${leak.file}: contains credential ${leak.name}`)
  }
  for (const file of files) {
    const { name } = file
    const text = file.metadataText ?? file.text
    if (/(?:^|\/)(?:\.[^/]+|proto-sky)(?:\/|$)|(?:^|\/)sky-test-|\.(?:map|tsx?|md|log|bak|blend)$/i.test(name)) {
      problems.push(`${name}: development file in publication`)
    }
    if (name.endsWith('.html') && commentRanges(text).length) problems.push(`${name}: HTML comments remain`)
    if (/(?:^|["'\s=])[A-Z]:[\\/]|\/(?:Users|home)\/[^/\s]+\//i.test(text)) {
      problems.push(`${name}: local filesystem path`)
    }
    if (/sourceMappingURL\s*=|["']sourcesContent["']\s*:/.test(text)) problems.push(`${name}: source map exposed`)
    if (/docs\/(?:reports|plans|adr)\//.test(text)) problems.push(`${name}: internal development notes`)
    if (production && text.includes('__vertigoBootDebug')) problems.push(`${name}: boot diagnostic exposed`)
  }
  return problems
}

export function verifyPublication(root: string, env: Record<string, string | undefined>, production: boolean): void {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('[publication] missing index.html')
  const files = listFiles(root).map((file) => {
    const name = path.relative(root, file).replace(/\\/g, '/')
    const bytes = fs.readFileSync(file)
    // Scan complete files for known secrets, but only text/metadata for path
    // patterns. Random compressed pixels can look like a drive-letter prefix.
    return { name, text: bytes.toString('utf8'), metadataText: assetMetadata(name, bytes) }
  })
  const problems = publicationProblems(files, env, production)
  if (problems.length) throw new Error('[publication]\n' + problems.join('\n'))
}
