import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'
import { parseImageRef } from './brandMark'

/**
 * Format and geometry rules for the site's favicon.
 *
 * The FAST tier, as `towerImage.ts` is: `content/collections/siteSeo.collection.ts`
 * and the media mirror enforce the same rules again and fail the deploy, because
 * a document written by an import or the HTTP API never passes through here.
 * The minimum size comes from `EDITORIAL_BOUNDS`, which both packages import.
 *
 * Synchronous, read off Sanity's asset id (`image-<hash>-<w>x<h>-<ext>`) through
 * `parseImageRef`, which fails OPEN: an id it cannot read passes, and the build
 * is the half that guarantees.
 */

const MIN_SIDE = EDITORIAL_BOUNDS.siteSettings.faviconMinSide

/** The blocking tier. A message from here disables Publicar. */
export function faviconErrors(value: unknown): true | string {
  const asset = parseImageRef(value)
  if (asset === null) return true

  if (asset.extension !== 'png') {
    if (asset.extension === 'svg' || asset.extension === 'svgz') {
      return 'Los archivos SVG no se admiten. Exporta el icono a PNG.'
    }
    return 'Formato no admitido (.' + asset.extension + '). El icono tiene que ser PNG.'
  }
  if (asset.width !== asset.height) {
    return (
      'El icono mide ' + asset.width + '×' + asset.height + ' y tiene que ser cuadrado. ' +
      'Recórtalo con el mismo ancho que alto.'
    )
  }
  if (asset.width < MIN_SIDE) {
    return (
      'El icono mide ' + asset.width + '×' + asset.height + ' y el mínimo es ' + MIN_SIDE + '×' +
      MIN_SIDE + ' píxeles. Más pequeño se vería borroso en el móvil.'
    )
  }
  return true
}
