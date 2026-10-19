import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { THREE_CATALOGUE } from './threeCatalogue'

// R3F only knows the classes the app registers (threeCatalogue.ts), so a JSX
// element missing from the catalogue throws when it mounts. This finds every
// lowercase JSX tag in src whose PascalCase name is a three export.
//
// `<path>` and `<line>` are also SVG elements; in a file that draws an `<svg>`
// they are taken to be SVG. A three `<line>` written next to an `<svg>` would
// slip past this, and still throw in the dev server on first mount.
const SVG_NAMES = new Set(['path', 'line'])

const SRC = path.join(__dirname, '..')

function threeElementsInJsx(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const files = fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
  for (const file of files) {
    const source = fs.readFileSync(path.join(SRC, file), 'utf8')
    const drawsSvg = source.includes('<svg')
    for (const [, tag] of source.matchAll(/<([a-z][A-Za-z0-9]*)[\s/>]/g)) {
      if (drawsSvg && SVG_NAMES.has(tag)) continue
      const name = tag[0].toUpperCase() + tag.slice(1)
      if (typeof (THREE as Record<string, unknown>)[name] !== 'function') continue
      used.set(name, [...(used.get(name) ?? []), file])
    }
  }
  return used
}

describe('THREE_CATALOGUE', () => {
  const used = threeElementsInJsx()

  it('registers every three class the JSX writes as an element', () => {
    const missing = [...used].filter(([name]) => !(name in THREE_CATALOGUE))
    expect(missing, 'add these to src/graphics/threeCatalogue.ts').toEqual([])
  })

  it('registers nothing the JSX does not use', () => {
    expect(Object.keys(THREE_CATALOGUE).filter((name) => !used.has(name))).toEqual([])
  })

  it('registers each class under its own name', () => {
    for (const [name, value] of Object.entries(THREE_CATALOGUE)) {
      expect(value).toBe((THREE as Record<string, unknown>)[name])
    }
  })
})
