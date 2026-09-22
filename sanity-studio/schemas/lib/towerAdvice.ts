import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'

/**
 * The advisory tier for the tower screen's text slots: what the build
 * accepts and the facade then shows differently from how the editor saw it.
 * Every one of these publishes; the field shows a yellow note.
 *
 * The HARD bound on each slot — the measured capacity of the wall — is the
 * schema's `max`, from the same table. What is here is the room before it:
 * the counts were measured on mixed text, and a run of wide capitals (M, W)
 * reaches the edge a character or two sooner.
 */

const TOWER = EDITORIAL_BOUNDS.towerScreen

/** A one-line slot whose measured room ends before its hard limit. */
function nearEdge(advised: number, where: string) {
  return (value: unknown): true | string => {
    if (typeof value !== 'string') return true
    const length = value.trim().length
    if (length <= advised) return true
    return (
      'Con ' + length + ' caracteres ' + where + ' se acerca al borde derecho de la pantalla; ' +
      'con letras anchas (M, W) puede tocarlo. Hasta ' + advised + ' va sobrado.'
    )
  }
}

export const headlineAdvice = nearEdge(TOWER.headlineAdvised, 'el titular')
export const listItemAdvice = nearEdge(TOWER.listItemAdvised, 'la línea')
export const caption1Advice = nearEdge(TOWER.caption1Advised, 'el pie')
export const captionAdvice = nearEdge(TOWER.captionAdvised, 'el pie')

/**
 * The figure with its sign and unit, as one run of digits on the wall. Each
 * affix is bounded on its own; what this judges is the whole.
 */
export function metricAdvice(slide: unknown): true | string {
  if (slide === null || typeof slide !== 'object') return true
  const { metricValue, metricPrefix, metricSuffix } = slide as Record<string, unknown>
  if (typeof metricValue !== 'number') return true
  const shown = String(metricPrefix ?? '') + String(Math.round(metricValue)) + String(metricSuffix ?? '')
  if (shown.length <= TOWER.metricCharsAdvised) return true
  return (
    'La cifra completa «' + shown + '» tiene ' + shown.length + ' caracteres y en la pantalla se escribe muy grande; ' +
    'a partir de ' + (TOWER.metricCharsAdvised + 1) + ' se acerca al borde. Acorta el prefijo o el sufijo, o redondea el número.'
  )
}

/** A screen that never turns is a choice, and this is what says so. */
export function singleSlideAdvice(value: unknown): true | string {
  if (!Array.isArray(value) || value.length !== 1) return true
  return 'Con una sola diapositiva la pantalla no rota: la muestra fija. Añade otra si quieres que cambie.'
}

/** The rotation's upper comfort: a long hold is legal, and nobody waits for it. */
export function rotationAdvice(value: unknown): true | string {
  if (typeof value !== 'number' || value <= TOWER.rotationSecondsAdvised) return true
  return (
    'Con ' + value + ' segundos por diapositiva casi nadie llegará a ver la segunda. ' +
    'Hasta ' + TOWER.rotationSecondsAdvised + ' suele bastar para leerla.'
  )
}
