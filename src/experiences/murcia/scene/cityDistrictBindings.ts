/**
 * Binds editorial district content to geometry in the city GLB, and to the
 * camera decision made when the district is entered.
 *
 * Separate from the generated content on purpose: Blender identifiers, accent
 * colours and camera angles are not editorial copy, and mixing them puts a
 * marketing edit one typo away from breaking asset resolution.
 */

/**
 * One service building, and the connection that carries its signal in to the
 * ring.
 *
 * The buildings are NOT navigation controls — the projected display is the
 * district's only interaction surface (plan 003 §6). A building is what a
 * service looks like in the world and what its connection starts from, and the
 * whole cluster is one entry target.
 */
export interface ServiceBuildingBinding {
  /** References `Service.id` inside `DistrictContent.services`. */
  serviceId: string;
  /**
   * Blender object name. Names ARE the identity for these — a per-building
   * custom property would add nothing the name does not already say — and they
   * are dot-free by contract, so GLTFLoader's reserved-character stripping
   * (`[ ] . : /`) cannot bite. `cityDistrictBindings.test.ts` enforces it.
   */
  nodeName: string;
  /**
   * Blender object name of the wedge running from that building in toward the
   * ring, which the fluid shader draws on.
   *
   * Paired here rather than derived from `nodeName` by string surgery: the two
   * agree on their number today, and a mapping that silently depended on that
   * would break the first time one of them is renumbered. Note the authored
   * double `c` in "conneccion" — correcting it here would only stop the lookup
   * resolving.
   */
  connectionNodeName: string;
  /**
   * The colour this service claims while it is selected, `0xrrggbb`.
   *
   * Scene composition, not content: it is what the ring and the connection turn
   * on selection, and it has to be legible against the city under Murcia's light
   * rig. An editor changing a service title should not be able to change it, and
   * a palette retune should not require a CMS deploy.
   */
  accent: number;
}

export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
  /**
   * Rig azimuth to settle on when flying into this district, degrees.
   *
   * Null keeps whatever heading the user had, which avoids an unrequested turn
   * but gives up control of the composition. A number is a deliberate choice of
   * how the district is framed on arrival — and it is also the display's resting
   * yaw, so the panel faces the visitor as they land.
   */
  approachYawDegrees: number | null;
  /**
   * How close to fly, as a multiple of the resting distance. Null keeps the
   * current distance and gives up the composition decision.
   *
   * Clamped against `FocusFlightConfig.minDistanceScale` rather than trusted,
   * and never allowed above 1: outward is the direction whose ground footprint
   * outgrows the terrain skirt, and it does so invisibly on 16:9.
   */
  focusDistanceScale: number | null;
  /**
   * The buildings, one per service. Order here is irrelevant: the tour order
   * (previous/next) is the district content's curated `services[]`.
   *
   * Every service in the content needs a row (the unit test fails otherwise);
   * a row whose node is missing from the GLB is reported at load and skipped.
   */
  buildings: readonly ServiceBuildingBinding[];
}

/**
 * The services district, as re-exported for the projected-display design.
 *
 * The export ships the cluster as `Edificios-servicios-*`: a plaza, one ring
 * band the fluid shader is drawn on, five buildings, five connection wedges and
 * three focos the display's beams leave from. The names the plaza, ring and
 * focos carry live in `district/districtConfig.ts`, because nothing about them
 * is per-service.
 *
 * Which slug sits on which building is an art decision made by position; this
 * table is the only place it lives.
 */
export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  {
    contentId: 'servicios',
    // The camera sits at direction (sin yaw, cos yaw) from the focus
    // (`applyPoseToCamera`, pose azimuth 0). The cluster is against the plate's
    // +X/+Z corner, so the camera stands OUT on the skirt side and looks back
    // in: the city fills the frame behind the buildings instead of the empty
    // skirt. Judged headlessly on 2026-08-27 and unchanged by the display
    // redesign — but it now also sets the display's resting yaw, so a person in
    // front of it is judging two things at once.
    approachYawDegrees: 45,
    // 0.78 -> distance ~152.
    //
    // Carried over from the per-building framing, and it is the pair that most
    // needs eyes: the flight frames the plaza on the GROUND, while the display
    // hangs 28 units above it, so distance and `PANEL_ELEVATION` in
    // `district/display/servicesDisplay.ts` are tuned together or not at all.
    // Arithmetic gets close and cannot settle it — at fov 35 the visible height
    // at the focus is ~96 units here against a 48-unit panel — but where the
    // panel sits in the frame is a composition judgement.
    focusDistanceScale: 0.78,
    buildings: [
      {
        serviceId: 'seo',
        nodeName: 'Edificios-servicios-001',
        connectionNodeName: 'Edificios-servicios-conneccion-001',
        accent: 0x06dbbe,
      },
      {
        serviceId: 'web-analysis',
        nodeName: 'Edificios-servicios-002',
        connectionNodeName: 'Edificios-servicios-conneccion-002',
        accent: 0x5fb800,
      },
      {
        serviceId: 'content-strategy',
        nodeName: 'Edificios-servicios-003',
        connectionNodeName: 'Edificios-servicios-conneccion-003',
        accent: 0xeb7500,
      },
      {
        serviceId: 'paid-campaigns',
        nodeName: 'Edificios-servicios-004',
        connectionNodeName: 'Edificios-servicios-conneccion-004',
        accent: 0xf00000,
      },
      {
        serviceId: 'brand-identity',
        nodeName: 'Edificios-servicios-005',
        connectionNodeName: 'Edificios-servicios-conneccion-005',
        accent: 0x4704cd,
      },
    ],
  },
];
