// Sample content for the six satellites.
//
// ⚠️  PLACEHOLDER DATA — NOT REAL CLIENTS, NOT REAL RESULTS.
// The brand names below are well-known Spanish companies picked at random to
// make the prototype legible at a glance. Every metric, percentage and sentence
// is invented. None of these are Vertigo clients and none of these figures
// happened. This file must be replaced with real, attributable content before
// anything ships publicly — presenting fabricated results under a real
// company's name would be a false endorsement claim, not just a rough draft.
//
// ── Why .ts and not .json ──
// A prototype iterates on this content constantly, so the priorities are type
// safety and zero runtime cost. A .ts module gives both: `CaseStudy` is checked
// at compile time (a typo in a field name fails `tsc -b` instead of rendering
// `undefined` on a badge), and the array is bundled and tree-shaken with no
// fetch, no parse and no loading state. A .json file would need either a
// `resolveJsonModule` import — which buys nothing over this and loses the union
// types — or a network round trip, which would mean the orbit system could no
// longer build its badges synchronously at mount.
//
// ── The API seam ──
// When this becomes an API, the shape here is the contract: keep `CaseStudy` as
// the type the UI consumes and map the API response into it, rather than letting
// a response shape leak into the components. The one thing to plan for is that
// the fetch is async while `createOrbitSystem` builds badges synchronously — so
// the seam is `SATELLITES` in orbitConfig.ts, which would become a fetched value
// that OrbitSystemLayer waits on (its readiness flag already gates the intro,
// exactly like the Earth textures do).

export interface CaseStudyMetric {
  label: string
  value: string
}

// Four chart shapes, cycled across the six cases. Values are invented series
// (same disclaimer as everything else in this file) and arbitrary units — the
// renderer in CaseChart.tsx normalizes them, so only the shape matters.
export type CaseChartType = 'line' | 'bars' | 'area' | 'donut'

export interface CaseChart {
  type: CaseChartType
  /** Short caption shown above the chart. */
  title: string
  /** Series values. For 'donut' these are shares of a whole. */
  values: number[]
  /** Per-value labels: x-axis ticks for 'bars', legend entries for 'donut'. */
  labels?: string[]
}

export interface CaseStudy {
  id: string
  /**
   * NOT CURRENTLY RENDERED. This was the text drawn on the old flat 3D badge,
   * which the satellite GLB and the brand atlas replaced — the atlas draws
   * `name`. Kept because it is a reasonable short-form field for an API to
   * carry, but nothing reads it today.
   */
  label: string
  /** Full brand name, shown as the panel title. */
  name: string
  /**
   * URL of the real company logo, drawn into this case's cell of the brand
   * atlas. A path under /public today (`/logos/mango.webp`), a CMS media URL
   * later — the loader does not care which, so pointing this at WordPress is a
   * string change and nothing else.
   *
   * Null, a 404, or an image that fails CORS all leave the generated plate (mark
   * disc + wordmark) in place. The panel is never blank.
   *
   * Artwork requirements are in docs/earth/logo-spec.md — the short version is
   * 1600×800 WebP, transparent, trimmed tight with NO built-in padding, and the
   * light/reverse variant, because the panel is a dark holographic surface.
   */
  logo: string | null
  /**
   * Accent colour for the holographic orbit panel — the mark, the wordmark and
   * the pane wash are all drawn from it. CSS hex string.
   *
   * These are DECORATIVE PLACEHOLDERS chosen for contrast against the starfield,
   * not the companies' real brand colours, for the same reason `logo` is null
   * everywhere: shipping a real trademark next to the invented results at the
   * top of this file would read as a client endorsement. Replace alongside the
   * rest of the content.
   */
  brandColor: string
  /**
   * NOT CURRENTLY READ, despite the name. The satellite↔orbit pairing is
   * POSITIONAL: createOrbitSystem walks ORBIT_PRESETS and takes SATELLITES at
   * the same index. This field agrees with that today only because both arrays
   * happen to be in the same order.
   *
   * That matters once the content is fetched and can arrive in any order — at
   * which point the honest fix is to resolve the preset by this id rather than
   * by position. Documented rather than silently corrected because changing the
   * pairing rule is a behaviour change, not a cleanup.
   */
  orbitId: string
  sector: string
  location: string
  year: string
  summary: string
  /** Bullet-point body copy under the summary. Four short lines each. */
  details: string[]
  /** Exactly two — the panel's metric row is a fixed two-up grid. */
  metrics: [CaseStudyMetric, CaseStudyMetric]
  chart: CaseChart
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'satellite-01',
    label: 'MANGO',
    name: 'Mango',
    brandColor: '#e0b33c',
    logo: null,
    orbitId: 'orbit-01',
    sector: 'Moda y retail',
    location: 'Barcelona, España',
    year: '2025',
    summary:
      'Reestructuración de la arquitectura de contenidos de catálogo y consolidación de páginas de categoría duplicadas en 14 mercados internacionales.',
    details: [
      'Auditoría de 60.000 URLs de categoría con detección de canibalizaciones.',
      'Nueva taxonomía de catálogo alineada con la demanda de búsqueda por mercado.',
      'Redirecciones y consolidación de señales en 3.200 páginas duplicadas.',
      'Playbook editorial entregado a los equipos locales de los 14 mercados.',
    ],
    metrics: [
      { label: 'Tráfico orgánico', value: '+38%' },
      { label: 'Top 3', value: '412 kws' },
    ],
    chart: {
      type: 'line',
      title: 'Tráfico orgánico mensual (miles de sesiones)',
      values: [182, 176, 190, 205, 214, 236, 231, 248, 262, 274, 289, 301],
    },
  },
  {
    id: 'satellite-02',
    label: 'CABIFY',
    name: 'Cabify',
    brandColor: '#7b4dff',
    logo: null,
    orbitId: 'orbit-02',
    sector: 'Movilidad',
    location: 'Madrid, España',
    year: '2025',
    summary:
      'Estrategia de contenidos locales por ciudad y rediseño del enlazado interno entre landings de servicio y páginas de destino.',
    details: [
      'Landings locales para 46 ciudades con contenido y datos de servicio propios.',
      'Rediseño del enlazado interno siguiendo el flujo real de reserva.',
      'Automatización de metadatos a partir de plantillas por tipo de servicio.',
      'Cuadro de mando de leads orgánicos por ciudad con atribución semanal.',
    ],
    metrics: [
      { label: 'Leads orgánicos', value: '+61%' },
      { label: 'CPA', value: '−27%' },
    ],
    chart: {
      type: 'bars',
      title: 'Leads orgánicos por trimestre',
      values: [640, 780, 950, 1030],
      labels: ['T1', 'T2', 'T3', 'T4'],
    },
  },
  {
    id: 'satellite-03',
    label: 'ESTRELLA',
    name: 'Estrella Galicia',
    brandColor: '#e2452f',
    logo: null,
    orbitId: 'orbit-03',
    sector: 'Alimentación y bebidas',
    location: 'A Coruña, España',
    year: '2024',
    summary:
      'Campaña de marca y contenido editorial en torno a la cultura cervecera, con medición de notoriedad asistida por búsqueda.',
    details: [
      'Serie editorial de 24 piezas sobre cultura cervecera y origen del producto.',
      'Colaboración con 12 creadores gastronómicos para amplificar la campaña.',
      'Medición de notoriedad vía volumen de búsquedas de marca por provincia.',
      'Optimización de la ficha de marca y los resultados enriquecidos asociados.',
    ],
    metrics: [
      { label: 'Búsquedas marca', value: '+44%' },
      { label: 'Alcance', value: '2,1M' },
    ],
    chart: {
      type: 'area',
      title: 'Búsquedas de marca (índice semanal)',
      values: [100, 104, 99, 112, 118, 124, 121, 133, 138, 146, 151, 144],
    },
  },
  {
    id: 'satellite-04',
    label: 'IDEALISTA',
    name: 'Idealista',
    brandColor: '#2fb56b',
    logo: null,
    orbitId: 'orbit-04',
    sector: 'Marketplace inmobiliario',
    location: 'Madrid, España',
    year: '2025',
    summary:
      'Auditoría técnica a escala sobre un catálogo de millones de URLs: presupuesto de rastreo, paginación facetada y datos estructurados.',
    details: [
      'Análisis de logs de rastreo sobre más de 40M de peticiones mensuales.',
      'Reglas de indexación para la navegación facetada por provincia y tipología.',
      'Datos estructurados de inmueble desplegados en todo el catálogo activo.',
      'Reducción del 35% en URLs rastreables sin valor de búsqueda.',
    ],
    metrics: [
      { label: 'Páginas indexadas', value: '+2,4M' },
      { label: 'Core Web Vitals', value: '96/100' },
    ],
    chart: {
      type: 'donut',
      title: 'Distribución del presupuesto de rastreo',
      values: [46, 27, 17, 10],
      labels: ['Fichas', 'Listados', 'Contenido', 'Otros'],
    },
  },
  {
    id: 'satellite-05',
    label: 'CAMPER',
    name: 'Camper',
    brandColor: '#ff7a3d',
    logo: null,
    orbitId: 'orbit-05',
    sector: 'Calzado y diseño',
    location: 'Inca, Mallorca, España',
    year: '2024',
    summary:
      'Expansión internacional del ecommerce con hreflang, adaptación de contenido por mercado y consolidación de dominios regionales.',
    details: [
      'Migración de 6 dominios regionales a una estructura única por carpetas.',
      'Matriz hreflang para 22 combinaciones de idioma y mercado.',
      'Localización de contenido de producto priorizada por demanda de búsqueda.',
      'Seguimiento de ingresos orgánicos por mercado desde el primer trimestre.',
    ],
    metrics: [
      { label: 'Ingresos orgánicos', value: '+52%' },
      { label: 'Mercados', value: '9 nuevos' },
    ],
    chart: {
      type: 'bars',
      title: 'Ingresos orgánicos por mercado (índice)',
      values: [148, 132, 121, 117, 108, 96],
      labels: ['DE', 'FR', 'UK', 'IT', 'NL', 'PL'],
    },
  },
  {
    id: 'satellite-06',
    label: 'FREIXENET',
    name: 'Freixenet',
    brandColor: '#38a9d6',
    logo: null,
    orbitId: 'orbit-06',
    sector: 'Vinos y espumosos',
    location: 'Sant Sadurní d’Anoia, España',
    year: '2024',
    summary:
      'Contenido estacional planificado sobre la curva de demanda de fin de año y captación de posiciones destacadas en recetas y maridajes.',
    details: [
      'Calendario editorial anclado a la curva de demanda de octubre a enero.',
      'Hub de recetas y maridajes con marcado de fragmentos destacados.',
      'Refresco anual de las piezas ganadoras antes del pico de temporada.',
      'Captación de 128 fragmentos destacados en consultas de celebración.',
    ],
    metrics: [
      { label: 'Pico de temporada', value: '+73%' },
      { label: 'Fragmentos', value: '128' },
    ],
    chart: {
      type: 'line',
      title: 'Demanda estacional captada (índice mensual)',
      values: [42, 38, 35, 40, 44, 47, 45, 52, 68, 96, 138, 173],
    },
  },
]
