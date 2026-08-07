/**
 * Editorial content for the interactive districts.
 *
 * Deliberately free of three.js, world coordinates and Blender identifiers: this
 * is copy, and it is the shape a CMS would later provide. Everything that binds
 * a district to the asset or to a camera decision lives in
 * `src/scene/cityDistrictBindings.ts` instead.
 *
 * Keeping the two apart matters because they change for unrelated reasons — copy
 * changes when marketing changes, bindings change when the GLB is re-exported.
 */

export interface DistrictService {
  /**
   * Stable identifier, unique within a district. Used to wire the accordion's
   * `aria-controls` to its region, so duplicates silently break the panel for
   * screen-reader users — `checks/district-flight.ts` asserts uniqueness.
   */
  id: string;
  title: string;
  /** Revealed when the section is opened. One or two short paragraphs. */
  body: string;
}

export interface DistrictContent {
  /** Stable identifier, referenced by a scene binding's `contentId`. */
  id: string;
  /** Short name, used on the projected label and as the panel heading. */
  label: string;
  /**
   * One sentence, and it must stay one sentence: this is what shows at the
   * mobile peek stop, where the sheet is only 40% of the viewport tall.
   */
  summary: string;
  /**
   * The panel's opening paragraph. Separate from `summary` because it has a
   * different job — it is never asked to survive in a 40%-tall sheet, so it can
   * take the room it needs.
   */
  intro: string;
  services: DistrictService[];
}

/**
 * PLACEHOLDER COPY — written to give the layout realistic text lengths to be
 * judged against, not to ship. Vertigo Marketing replaces everything below.
 *
 * Note the bodies are English while `label` is Spanish, matching the Blender
 * naming. That inconsistency is deliberate only in the sense that it was
 * inherited; it should be settled one way or the other before this is seen by
 * anyone outside the team.
 */
export const districtContent: readonly DistrictContent[] = [
  {
    id: 'servicios',
    label: 'Servicios',
    summary: 'Lo que hacemos por los negocios que viven en esta ciudad.',
    intro:
      'Cada edificio de este distrito es una parte de nuestro trabajo. Nos ' +
      'ocupamos de aquello que se acumula con el tiempo: lo que cuesta ' +
      'construir y es difícil recuperar una vez descuidado. Elige un servicio ' +
      'para ver cómo lo abordamos.',
    services: [
      {
        id: 'seo',
        title: 'SEO',
        body:
          'La búsqueda es el único canal que sigue devolviéndote el trabajo que ' +
          'hiciste hace meses. Auditamos lo que frena técnicamente a un sitio, ' +
          'reconstruimos la estructura que los buscadores leen de verdad y ' +
          'apuntamos a las búsquedas que hacen tus clientes, no a las que tienen ' +
          'el número más grande al lado. Los resultados se miden en ingresos, no ' +
          'en posiciones.',
      },
      {
        id: 'web-analysis',
        title: 'Analítica web',
        body:
          'La mayoría de sitios recogen muchos más datos de los que alguien lee. ' +
          'Montamos una medición que responde preguntas concretas — dónde ' +
          'abandona la gente, qué venían a buscar y no encontraron, qué páginas ' +
          'sostienen el trabajo — y después te decimos qué cambiar. Una analítica ' +
          'sobre la que nadie actúa es un coste, no un activo.',
      },
      {
        id: 'content-strategy',
        title: 'Estrategia de contenidos',
        body:
          'Publicar más no es una estrategia. Trazamos lo que tus clientes ' +
          'necesitan saber antes de comprar, encontramos los huecos que tu ' +
          'competencia ha dejado abiertos y construimos un plan que puedas ' +
          'sostener de verdad. Menos piezas, cada una ganándose su sitio y ' +
          'llevando a alguna parte.',
      },
      {
        id: 'paid-campaigns',
        title: 'Campañas de pago',
        body:
          'El tráfico de pago revela lo que ya era cierto sobre tu oferta: compra ' +
          'atención, no compra persuasión. Empezamos por la experiencia de ' +
          'aterrizaje, después construimos campañas en torno a los segmentos que ' +
          'convierten y cortamos rápido los que no, en lugar de defenderlos.',
      },
      {
        id: 'brand-identity',
        title: 'Identidad de marca',
        body:
          'Una marca es lo que la gente sabe describir de ti cuando no estás ' +
          'delante. Definimos qué debería ser eso y construimos el sistema que lo ' +
          'sostiene — nombre, tono, tipografía, color y las reglas para usarlos — ' +
          'para que el décimo contacto siga pareciéndose al primero.',
      },
    ],
  },
];

export function findDistrictContent(id: string): DistrictContent | null {
  return districtContent.find((entry) => entry.id === id) ?? null;
}
