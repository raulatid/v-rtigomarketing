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

const hosts: Record<string, readonly string[]> = {
  youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
}
export function videoProblem(value: unknown, provider: unknown): true | string {
  if (!value) return true // Required has its own message.
  let url: URL
  try { url = new URL(String(value)) } catch { return 'Pega la dirección completa del vídeo, empezando por https://' }
  if (url.protocol !== 'https:') return 'La dirección del vídeo debe empezar por https://'
  if (!hosts[String(provider)]?.includes(url.hostname)) {
    return 'El enlace no corresponde a la plataforma elegida. Selecciona YouTube o Vimeo según el enlace.'
  }
  return true
}
