/**
 * Coercion primitives for untrusted CMS values.
 *
 * Every function here answers the same question — "is this usable, and if so
 * what is it?" — and answers it with a value or with `undefined`. None of them
 * throw: a mapper collects what failed and reports the whole entity at once, so
 * that a content editor fixing three fields does not need three build failures
 * to find them.
 *
 * TypeScript is not a substitute for any of this. `CaseStudy` says `metrics` is
 * a two-tuple; a REST response has no obligation to honour that and the type is
 * erased before the data arrives. These are the runtime half of the same claim.
 */
import { collapseWhitespace, plainTextProblem, stripHtml } from './html'

export interface Problem {
  path: string
  message: string
}

/**
 * Accumulates problems while mapping one entity.
 *
 * Passed down rather than returned up so a nested field can report its own dotted
 * path without every level threading a result type.
 */
export class Report {
  readonly problems: Problem[] = []

  constructor(private readonly prefix: string) {}

  fail(path: string, message: string): undefined {
    this.problems.push({ path: this.prefix ? this.prefix + '.' + path : path, message })
    return undefined
  }

  get ok(): boolean {
    return this.problems.length === 0
  }
}

/**
 * A plain-text string, stripped of markup and bounded.
 *
 * `max` is a hard reject rather than a truncation. Truncating a headline mid-word
 * ships a visible defect that nobody asked for and that looks like a rendering
 * bug; failing the build hands it back to whoever wrote it, while the site keeps
 * serving the previous deployment.
 */
export function text(
  report: Report,
  path: string,
  value: unknown,
  opts: { max?: number; allowEmpty?: boolean } = {},
): string | undefined {
  if (typeof value !== 'string') return report.fail(path, 'expected a string, got ' + typeOf(value))
  const clean = stripHtml(value)
  const residue = plainTextProblem(clean)
  if (residue) return report.fail(path, residue)
  if (!opts.allowEmpty && clean.length === 0) return report.fail(path, 'must not be empty')
  if (opts.max !== undefined && clean.length > opts.max) {
    return report.fail(path, 'is ' + clean.length + ' chars, over the ' + opts.max + ' limit')
  }
  return clean
}

/** An identifier safe for `aria-controls`, DOM ids and file names. */
export function slug(report: Report, path: string, value: unknown, pattern: RegExp): string | undefined {
  if (typeof value !== 'string') return report.fail(path, 'expected a string, got ' + typeOf(value))
  const trimmed = collapseWhitespace(value)
  if (!pattern.test(trimmed)) {
    return report.fail(path, '"' + trimmed + '" does not match ' + pattern)
  }
  return trimmed
}

/**
 * A finite number.
 *
 * Accepts a numeric string, because ACF number fields and post meta round-trip
 * through the database as strings often enough that rejecting them would be
 * pedantry rather than safety. Does NOT accept `''`, `null` or `'12%'` — all of
 * which `Number()` turns into something (`0`, `0`, `NaN`) that a chart would
 * render as a real data point or as an invalid SVG path.
 */
export function num(
  report: Report,
  path: string,
  value: unknown,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  const raw = typeof value === 'string' ? value.trim() : value
  if (raw === '' || raw === null || raw === undefined) {
    return report.fail(path, 'expected a number, got ' + typeOf(value))
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return report.fail(path, 'expected a number, got ' + typeOf(value))
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return report.fail(path, JSON.stringify(value) + ' is not a finite number')
  }
  if (opts.min !== undefined && parsed < opts.min) {
    return report.fail(path, parsed + ' is below the minimum ' + opts.min)
  }
  if (opts.max !== undefined && parsed > opts.max) {
    return report.fail(path, parsed + ' is above the maximum ' + opts.max)
  }
  return parsed
}

/**
 * A bounded array, every item mapped.
 *
 * Over-length is a failure, not a silent trim: a case study with twenty chart
 * points is content nobody has designed for, and quietly showing the first
 * sixteen makes the chart wrong rather than absent.
 */
export function boundedArray<T>(
  report: Report,
  path: string,
  value: unknown,
  max: number,
  item: (report: Report, path: string, value: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return report.fail(path, 'expected an array, got ' + typeOf(value))
  if (value.length > max) {
    return report.fail(path, 'has ' + value.length + ' entries, over the ' + max + ' limit')
  }
  const mapped: T[] = []
  let failed = false
  value.forEach((entry, i) => {
    const result = item(report, path + '[' + i + ']', entry)
    if (result === undefined) failed = true
    else mapped.push(result)
  })
  return failed ? undefined : mapped
}

export function oneOf<T extends string>(
  report: Report,
  path: string,
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  return report.fail(path, JSON.stringify(value) + ' must be one of ' + allowed.join(', '))
}

export function hexColor(
  report: Report,
  path: string,
  value: unknown,
  pattern: RegExp,
): string | undefined {
  if (typeof value !== 'string') return report.fail(path, 'expected a string, got ' + typeOf(value))
  const trimmed = value.trim()
  if (!pattern.test(trimmed)) {
    return report.fail(path, '"' + trimmed + '" is not a #rrggbb colour')
  }
  return trimmed.toLowerCase()
}

/**
 * The URL of a media file on the CMS, as a candidate for mirroring.
 *
 * SEPARATE from the check on the emitted local path, deliberately. This one
 * decides whether we are willing to *fetch* something; the local-path check
 * decides whether we are willing to *ship* a reference. Collapsing them is how a
 * validator ends up trusting a remote URL because the local one looked fine.
 *
 * Origin comparison is done on the parsed `URL.origin`, never by string prefix.
 * `SEC-1` in the security audit is exactly this mistake made once already: a
 * pattern-matched same-origin guard elsewhere in this repo is bypassable with a
 * backslash, because the URL parser treats `\` as `/`. Parsing is immune to that
 * and to tab, newline and percent-encoding variants at once.
 */
export function remoteMediaUrl(
  report: Report,
  path: string,
  value: unknown,
  allowedOrigin: string,
): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value !== 'string') return report.fail(path, 'expected a string, got ' + typeOf(value))

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return report.fail(path, '"' + value + '" is not an absolute URL')
  }
  if (url.protocol !== 'https:') return report.fail(path, 'must be https, got ' + url.protocol)

  let origin: string
  try {
    origin = new URL(allowedOrigin).origin
  } catch {
    return report.fail(path, 'the configured CMS origin is not a valid URL')
  }
  if (url.origin !== origin) {
    return report.fail(path, 'origin ' + url.origin + ' is not the CMS origin ' + origin)
  }
  // An SVG in the media library is served at its own URL, so it is stored XSS
  // for anyone who opens it directly — core blocks SVG upload by default and
  // that should stay blocked. Rejecting here as well costs nothing and does not
  // depend on the WordPress install staying configured correctly.
  if (/\.svgz?$/i.test(url.pathname)) {
    return report.fail(path, 'SVG is not an allowed logo format')
  }
  return url.toString()
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
