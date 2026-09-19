import type { ValidationContext } from 'sanity'
import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'
import type { BrandMarkKind } from './brandMark'

/**
 * The one brand-mark rule `brandMark.ts` leaves out: file weight.
 *
 * The asset id carries dimensions and format, not bytes, so this is the
 * round-trip that file declines to make. It is made here because the content
 * build's media mirror refuses anything over `brandMarkBytes` — and a 2048 px
 * PNG with an alpha channel passes every synchronous rule while weighing more
 * than that, which was a failed deployment for a logo the Studio had accepted.
 */
const NOUN: Record<BrandMarkKind, string> = { isotype: 'El isotipo', logo: 'El logotipo' }

export function brandMarkWeight(kind: BrandMarkKind) {
  return async (value: unknown, context: ValidationContext): Promise<true | string> => {
    const ref = (value as {asset?: {_ref?: unknown}} | null | undefined)?.asset?._ref
    if (typeof ref !== 'string') return true
    let size: unknown
    try {
      size = await context.getClient({apiVersion: '2026-08-23'}).fetch('*[_id == $ref][0].size', {ref})
    } catch {
      return 'No se ha podido comprobar el peso del archivo. Revisa la conexión y vuelve a intentarlo antes de publicar.'
    }
    // Reads the same way as `parseImageRef`: what cannot be judged passes, and
    // the build stays the half that guarantees.
    if (typeof size !== 'number') return true
    const cap = EDITORIAL_BOUNDS.caseStudy.brandMarkBytes
    if (size <= cap) return true
    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB'
    return (
      NOUN[kind] + ' pesa ' + mb(size) + ' y el máximo es ' + mb(cap) + '. ' +
      'Expórtalo de nuevo con menos resolución o como WebP y vuelve a subirlo.'
    )
  }
}
