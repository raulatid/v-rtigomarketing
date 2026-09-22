import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'
import { parseImageRef, type ParsedImageAsset } from './brandMark'

/**
 * Format and geometry rules for a tower slide's picture.
 *
 * ── Why the Studio checks this at all ──
 * The picture is drawn into the LED facade's canvas, feathered into the wall:
 * a wrong file never breaks the page, it draws cropped, soft, or as a strip.
 * Quiet wrongness is the expensive kind, so an editor is told at the field,
 * while the file is still in their hand.
 *
 * ── This tier is the FAST one, not the guarantee ──
 * `content/lib/mirror.ts` enforces the same band again and fails the deploy,
 * because `sanity dataset import`, a restored backup and the HTTP API all
 * write documents this file never sees. The numbers come from
 * `EDITORIAL_BOUNDS.towerScreen`, which both packages import, so the two
 * tiers cannot disagree about where the line is.
 *
 * ── No async validator ──
 * Sanity's asset id spells out the upload's size and format
 * (`image-<hash>-<w>x<h>-<ext>`), so everything here is a synchronous string
 * parse through `parseImageRef`, which fails OPEN: an id it cannot read
 * passes, and the build is the half that guarantees.
 */

const TOWER = EDITORIAL_BOUNDS.towerScreen

/**
 * PNG, WebP and JPEG. Unlike a brand mark, a slide picture has no
 * transparency to lose: it is a photograph feathered into a dark wall.
 */
const ALLOWED_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg']

/** `1600×2400`, in the notation the field descriptions already use. */
const size = (asset: ParsedImageAsset): string => asset.width + '×' + asset.height

/** `1,7:1` — one decimal, comma, as Spanish writes it. */
const ratio = (asset: ParsedImageAsset): string =>
  (asset.width / asset.height).toFixed(1).replace('.', ',') + ':1'

/** The blocking tier. A message from here disables Publicar. */
export function towerImageErrors(value: unknown): true | string {
  const asset = parseImageRef(value)
  if (asset === null) return true

  if (!ALLOWED_EXTENSIONS.includes(asset.extension)) {
    if (asset.extension === 'svg' || asset.extension === 'svgz') {
      return 'Los archivos SVG no se admiten. Exporta la imagen a JPG, PNG o WebP.'
    }
    return 'Formato no admitido (.' + asset.extension + '). Exporta la imagen a JPG, PNG o WebP.'
  }

  if (asset.width > TOWER.imageMaxSide || asset.height > TOWER.imageMaxSide) {
    return (
      'La imagen mide ' + size(asset) + ' y el máximo es ' + TOWER.imageMaxSide +
      ' píxeles de lado. Reduce su tamaño antes de subirla.'
    )
  }

  const aspect = asset.width / asset.height
  if (aspect < TOWER.imageMinAspect) {
    return (
      'Demasiado estrecha: ' + size(asset) + ' (' + ratio(asset) + '). El hueco de la torre es vertical, ' +
      'pero por debajo de ' + TOWER.imageMinAspect.toFixed(2).replace('.', ',') +
      ':1 la imagen queda como una tira. Recórtala más cuadrada.'
    )
  }
  if (aspect > TOWER.imageMaxAspect) {
    return (
      'Demasiado apaisada: ' + size(asset) + ' (' + ratio(asset) + '). Por encima de ' + TOWER.imageMaxAspect +
      ':1 solo se vería una franja en el hueco vertical de la torre. Recórtala más cuadrada.'
    )
  }
  return true
}

/**
 * The advisory tier. Publicar stays enabled; the field shows a yellow note.
 *
 * `fit` is the slide's «Encuadre» radio, because the advice differs: a
 * landscape photo under `cover` loses most of itself to the crop, while under
 * `contain` it simply draws short. The caller reads the sibling field and
 * passes it in.
 */
export function towerImageAdvice(value: unknown, fit: unknown): true | string {
  const asset = parseImageRef(value)
  if (asset === null) return true
  if (towerImageErrors(value) !== true) return true

  const aspect = asset.width / asset.height
  if (fit !== 'contain' && aspect > 1.2) {
    return (
      'La foto es apaisada (' + ratio(asset) + ') y el hueco de la torre es vertical (2:3): con «Rellenar el hueco» ' +
      'se recortan los lados y queda solo la franja central. Si debe verse entera, elige «Mostrar la imagen entera».'
    )
  }
  if (asset.width < TOWER.imageMinWidthAdvised) {
    return (
      'La imagen mide ' + size(asset) + '. Por debajo de ' + TOWER.imageMinWidthAdvised +
      ' píxeles de ancho se verá borrosa en la pantalla. Se publica igual; si tienes una versión mayor, súbela.'
    )
  }
  if (asset.width > TOWER.imageWastefulWidth) {
    return (
      'La imagen mide ' + size(asset) + '. La pantalla no muestra más de ' + TOWER.imageWastefulWidth +
      ' píxeles de ancho; el resto solo pesa. Se publica igual.'
    )
  }
  // Nothing about the shape of a `contain` picture: whatever it is, it is
  // shown whole, and the slot's own 2:3 is only the ideal.
  return true
}
