import { EMBED_HOSTS } from '../../../src/content/editorialBounds'

/** Pure checks used by Studio and its regression tests. No network or mutations. */
export function imageProblem(value: unknown): true | string {
  if (value == null) return true
  const ref = (value as {asset?: {_ref?: string}}).asset?._ref
  if (!ref) return 'Sube una imagen, o borra el campo entero para dejarlo vacío.'
  const match = /^image-[a-z0-9]+-(\d+)x(\d+)-([a-z0-9]+)$/i.exec(ref)
  if (!match) return 'No se puede comprobar esta imagen. Vuelve a subirla.'
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(match[3].toLowerCase())) {
    return 'Formato no admitido. Exporta la imagen a PNG, JPG o WebP y vuelve a subirla.'
  }
  if (+match[1] > 8192 || +match[2] > 8192) return 'La imagen supera 8192 píxeles. Reduce su tamaño antes de subirla.'
  return true
}

const PROVIDER_NAME: Record<string, string> = {youtube: 'YouTube', vimeo: 'Vimeo'}
const hosts: Record<string, readonly string[]> = EMBED_HOSTS

/**
 * Two different mistakes, two different messages. A Vimeo link under
 * «YouTube» is the wrong platform; `m.youtube.com` under «YouTube» is the
 * right platform on a host the site does not accept, and telling that editor
 * to "select YouTube" sent them in a circle.
 */
export function videoProblem(value: unknown, provider: unknown): true | string {
  if (!value) return true // Required has its own message.
  let url: URL
  try { url = new URL(String(value)) } catch { return 'Pega la dirección completa del vídeo, empezando por https://' }
  if (url.protocol !== 'https:') return 'La dirección del vídeo debe empezar por https://'
  const chosen = String(provider)
  if (hosts[chosen]?.includes(url.hostname)) return true
  const actual = Object.keys(hosts).find((name) => hosts[name].includes(url.hostname))
  if (actual !== undefined && actual !== chosen) {
    return 'Este enlace es de ' + PROVIDER_NAME[actual] + ', y arriba está elegido ' + (PROVIDER_NAME[chosen] ?? chosen) + '. Cambia la plataforma.'
  }
  return (
    'La web no acepta enlaces de ' + url.hostname + '. Pega la dirección tal como aparece en el navegador del ordenador' +
    (hosts[chosen] ? ', desde ' + hosts[chosen].join(', ') : '') + '.'
  )
}
