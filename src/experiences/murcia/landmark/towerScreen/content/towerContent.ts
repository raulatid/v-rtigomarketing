import type { FacadeContentDocument } from './facadeContent';

/**
 * What the tower's screen says, bundled.
 *
 * Plain serialisable data checked against FacadeContentDocument by TypeScript.
 * External content would need validation at its own ingestion boundary.
 *
 * ## Every metre here is a DESIGN metre
 *
 * The layouts were drawn for the screen at its modelled size: 42.8 m wide and
 * 154.06 m tall. The city ships the same tower with its scale APPLIED at about
 * 0.307, so the real mesh measures ~13.1 m wide. `mediaFacade` normalises
 * whatever it measures to `DESIGN_METRES_WIDE`, which is what keeps every
 * position, cap height, feather and LED pitch below valid at any applied scale
 * — and what makes the city's screen look exactly like the lab's, only smaller.
 *
 * Everything hangs off one 7.5 m margin, which clears the screen's tapered left
 * edge at every height the type sits at. Top to bottom: the name, the
 * vocabulary written in row by row, a picture across the middle feathered into
 * the wall, and the evidence underneath.
 */
export const DESIGN_METRES_WIDE = 42.8;

/**
 * The only paths in this file, so each repository points them at its own
 * folder in one place. Root-absolute, served from `public/`.
 */
export const TOWER_IMAGES = {
  earth: '/textures/murcia/tower/global-earth-network-connections-001.webp',
  /** A WATERMARKED stock preview at 260×280: a placeholder that must not ship. */
  christmas: '/textures/murcia/tower/imagen-navidad-descuento.webp',
} as const;

export const TOWER_DOCUMENT: FacadeContentDocument = {
  compositions: [
    {
      template: 'freeform',
      id: 'tower',
      label: 'tower',
      blocks: [
        {
          type: 'image',
          src: TOWER_IMAGES.earth,
          at: [0, 46.2],
          size: [42.8, 61.62],
          fit: 'cover',
          feather: 6,
          stage: [0.3, 0.7],
        },
        { type: 'headline', text: 'VERTIGO', at: [7.5, 11.5], size: 4.2, tracking: 0.2, stage: [0.05, 0.3] },
        {
          type: 'list',
          items: ['SEO', 'Marca', 'Progreso'],
          at: [7.5, 22.5],
          size: 3.2,
          leading: 7.5,
          stagger: 0.08,
          reveal: 'wipe',
          stage: [0.15, 0.35],
        },
        {
          type: 'metric',
          value: 50,
          suffix: '%',
          at: [7.5, 121],
          size: 6,
          tone: 'accent',
          countUp: true,
          stage: [0.55, 0.85],
        },
        { type: 'caption', text: 'CRECIMIENTO', at: [7.5, 126], size: 1.8, tracking: 0.25, stage: [0.65, 0.85] },
        {
          type: 'caption',
          text: 'EN TRÁFICO ORGÁNICO',
          at: [7.5, 130.5],
          size: 1.3,
          tracking: 0.1,
          tone: 'muted',
          stage: [0.72, 0.92],
        },
        {
          type: 'caption',
          text: 'EN LOS ÚLTIMOS 12 MESES',
          at: [7.5, 134],
          size: 1.3,
          tracking: 0.1,
          tone: 'muted',
          stage: [0.78, 0.98],
        },
      ],
    },
    {
      template: 'freeform',
      id: 'tower-brand',
      label: 'tower-brand',
      // On `tower`'s own grid — same margin, baselines, windows, and the picture
      // on the same centre — so the crossfade reads as one page changing its
      // words. The picture is 260×280, so its box is 42.8 × 46.1 m and the dust
      // lands on the picture rather than beside it.
      blocks: [
        {
          type: 'image',
          src: TOWER_IMAGES.christmas,
          at: [0, 53.95],
          size: [42.8, 46.1],
          fit: 'contain',
          feather: 3,
          dust: true,
          stage: [0.3, 0.7],
        },
        { type: 'headline', text: 'NAVIDAD', at: [7.5, 11.5], size: 4.2, tracking: 0.2, stage: [0.05, 0.3] },
        {
          type: 'list',
          items: ['Identidad', 'Web', 'Crecimiento'],
          at: [7.5, 22.5],
          size: 3.2,
          leading: 7.5,
          stagger: 0.08,
          reveal: 'wipe',
          stage: [0.15, 0.35],
        },
        {
          type: 'metric',
          value: 30,
          prefix: '−',
          suffix: '%',
          at: [7.5, 121],
          size: 6,
          tone: 'accent',
          countUp: true,
          stage: [0.55, 0.85],
        },
        { type: 'caption', text: 'DESCUENTO', at: [7.5, 126], size: 1.8, tracking: 0.25, stage: [0.65, 0.85] },
        {
          type: 'caption',
          text: 'EN SERVICIOS',
          at: [7.5, 130.5],
          size: 1.3,
          tracking: 0.1,
          tone: 'muted',
          stage: [0.72, 0.92],
        },
        {
          type: 'caption',
          text: 'SELECCIONADOS',
          at: [7.5, 134],
          size: 1.3,
          tracking: 0.1,
          tone: 'muted',
          stage: [0.78, 0.98],
        },
      ],
    },
  ],
  // Five seconds is a placeholder the client will tune.
  rotation: { compositions: ['tower', 'tower-brand'], seconds: 5 },
};
