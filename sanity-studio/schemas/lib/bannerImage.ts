import { parseImageRef } from './brandMark'

/**
 * Format and geometry rules for the Vertigo building's banner image.
 *
 * The same arrangement as `brandMark.ts`, for the same reason: this tier is the
 * FAST one — the editor is told at the field — and `siteSettings.collection.ts`
 * carries the same numbers again and fails the deploy. Neither package may
 * import the other, so the numbers are written twice on purpose; change the
 * collection first, then here.
 *
 * ── Where the numbers come from ──
 * The banner is drawn on the four faces of the sign on the Vertigo tower
 * (`murcia/landmark/vertigoBuildingConfig.ts`). Each face is about 1.84:1, and
 * the image is stretched to fit the face exactly, so an image far from that
 * shape reads squashed. 1.6–2.1:1 is the band where nobody notices. 1024 wide is
 * plenty for a sign seen from across a city; below it the LEDs read sharper than
 * the picture they frame.
 */
const ALLOWED_EXTENSIONS = ['png', 'webp']
const MIN_WIDTH = 1024
const MIN_HEIGHT = 512
const ASPECT_MIN = 1.6
const ASPECT_MAX = 2.1

export function bannerImageErrors() {
  return (value: unknown): true | string => {
    const asset = parseImageRef(value)
    if (asset === null) return true

    if (!ALLOWED_EXTENSIONS.includes(asset.extension)) {
      return (
        'Formato no admitido (.' +
        asset.extension +
        '). Exporta la imagen a PNG o WebP; un JPG se acepta mal en la pantalla del edificio.'
      )
    }
    if (asset.width < MIN_WIDTH || asset.height < MIN_HEIGHT) {
      return (
        'Demasiado pequeña: ' +
        asset.width +
        '×' +
        asset.height +
        '. La pantalla necesita al menos ' +
        MIN_WIDTH +
        '×' +
        MIN_HEIGHT +
        ' píxeles; por debajo se ve borrosa entre los LEDs.'
      )
    }
    const aspect = asset.width / asset.height
    if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) {
      return (
        'La pantalla es apaisada, casi el doble de ancha que de alta (entre 1,6:1 y 2,1:1). ' +
        'Esta imagen mide ' +
        asset.width +
        '×' +
        asset.height +
        ' (' +
        aspect.toFixed(1).replace('.', ',') +
        ':1) y se vería deformada. Recórtala a 2:1, por ejemplo 1600×800.'
      )
    }
    return true
  }
}
