/** Shared editorial fields: Studio limits and build-time migration defaults.
 * Category identifiers and consent behaviour are deliberately not editable. */
export const COOKIE_COPY_FIELDS = [
  ['title', 'Título del panel y acceso', 60, 'Cookies y preferencias'],
  ['bannerTitle', 'Título del aviso inicial', 40, 'Cookies'],
  ['bannerBody', 'Texto del aviso inicial', 350, 'Vertigo utiliza almacenamiento propio para recordar tu experiencia si lo permites. Puedes elegir tus preferencias. Google Analytics todavía no está instalado.'],
  ['intro', 'Introducción del panel', 240, 'Elige qué puede recordar Vertigo en este navegador. Puedes cambiar tu elección en cualquier momento.'],
  ['necessaryTitle', 'Categoría: necesarias', 60, 'Necesarias'],
  ['necessaryBody', 'Descripción de las necesarias', 300, 'Guardan tu elección de cookies y la música que activas o desactivas.'],
  ['alwaysActive', 'Estado de las necesarias', 40, 'Siempre activas'],
  ['preferencesTitle', 'Categoría: experiencia', 70, 'Preferencias de experiencia'],
  ['preferencesBody', 'Descripción de experiencia', 300, 'Recuerdan que ya has visto la introducción para acortarla en próximas visitas.'],
  ['analyticsTitle', 'Categoría: analítica', 60, 'Analítica'],
  ['analyticsBody', 'Descripción de analítica', 350, 'Permitiría medir visitas y uso con Google Analytics, un servicio de Google. Todavía no está instalado ni se envían datos de analítica.'],
  ['acceptAll', 'Botón aceptar', 40, 'Aceptar todas'],
  ['rejectAll', 'Botón rechazar', 40, 'Rechazar todas'],
  ['save', 'Botón guardar selección', 50, 'Guardar preferencias'],
  ['configure', 'Botón configurar', 50, 'Configurar cookies'],
  ['saved', 'Confirmación al guardar', 80, 'Preferencias guardadas'],
  ['unsaved', 'Aviso de cambios pendientes', 80, 'Cambios sin guardar'],
  ['policy', 'Desplegable de política legal', 70, 'Leer la política de cookies'],
  ['close', 'Botón cerrar: nombre accesible', 40, 'Cerrar'],
] as const
export type CookieCopy = Record<(typeof COOKIE_COPY_FIELDS)[number][0], string>
export const DEFAULT_COOKIE_COPY = Object.fromEntries(COOKIE_COPY_FIELDS.map(([key, , , value]) => [key, value])) as CookieCopy
