/**
 * The Vertigo building — the client's own tower in the city, and the one
 * landmark whose parts the runtime touches by name.
 *
 * ## The contract the GLB keeps (since murcia-v4)
 *
 * The tower arrives as `VERTIGO_ROOT` and its parts, exported with its scale
 * APPLIED — every vertex moved, no node scale — at about 0.307 of the modelled
 * 208 m building, and with NO materials:
 *
 *   `ARCH_*`, `BRAND_VERTIGO`   the building. Coloured at runtime by these
 *                                names (`towerScreen/towerPalette.ts`), since
 *                                the city's material pass would otherwise dress
 *                                it like every other building.
 *   `LED_Main`                  THE SCREEN: one curved strip whose authored UVs
 *                                are at its physical aspect (a 1024 × 3686
 *                                artwork), v running top to bottom.
 *   `logo-V`                    THE LOGO, lower half: the isotype's V, a direct
 *                                child of the scene root with its pivot at its
 *                                own centre, on the tower's crown.
 *   `logo-curva`                the logo's upper half: the isotype's arc, same.
 *
 * ## The logo turns
 *
 * The two curve meshes are the same two the header's mark is built from
 * (`vertigo-isotipo-3d.glb`), standing on the tower's cap. They turn about
 * their own local +Y, and because their pivots share (x, z) to within a hair
 * they turn as one piece — the pivot being at each mesh's OWN CENTRE is what
 * makes "rotate about local Y" mean "spin in place" with no offset arithmetic.
 * That is the one thing an export must not move: a pivot dragged to a corner
 * would make the mark orbit its post instead of turning on it. Both are
 * exported with NO rotation and NO scale, so the turn composes onto nothing.
 *
 * ## The screen runs the tower's compositions
 *
 * `towerScreen/` draws them onto `LED_Main` through its UVs, so nothing here
 * depends on the screen's orientation — it carries the tower's own turn, and
 * the asset check holds it to its name only. Its layouts are in the metres of
 * the modelled building; the applied scale is undone by the screen's design
 * width (`towerScreen/content/towerContent.ts`), so a re-export at another
 * scale needs no layout edit.
 *
 * Every node is optional at runtime — a missing one warns and the city loads
 * without it — and every one is asserted on the file by
 * `npm run check:asset:contract`, exactly as for the river and the blog
 * cluster. This module stays a leaf: the check bundles it for Node, which has
 * no loader for the screen's shaders.
 */

export interface TowerLogoConfig {
  /** The node's LOCAL axis; +Y is vertical for both logo nodes. */
  axis: 'x' | 'y' | 'z';
  /**
   * Radians per second. 0.35 is one turn every ~18 seconds — slow enough to
   * read as a landmark rather than a fan, fast enough that a viewer who looks
   * at the tower for a few seconds sees it move.
   */
  angularSpeedRadPerSec: number;
}

export interface VertigoBuildingConfig {
  /** Every node of the logo, turned together in one rigid motion. */
  logoNodeNames: readonly string[];
  /** The mesh the tower's compositions are drawn on. */
  screenNodeName: string;
  /**
   * Which UV set of that mesh is the screen: 0 for `TEXCOORD_0`, 1 for
   * `TEXCOORD_1`. Since murcia-v7 the exporter writes the material graph's
   * trim-band UV first and the authored screen UV second (export contract
   * §6.8); the facade reads whichever set this names and ignores the other.
   */
  screenUvChannel: 0 | 1;
  logo: TowerLogoConfig;
}

export const VERTIGO_BUILDING: VertigoBuildingConfig = {
  logoNodeNames: ['logo-V', 'logo-curva'],
  screenNodeName: 'LED_Main',
  screenUvChannel: 1,
  logo: { axis: 'y', angularSpeedRadPerSec: 0.35 },
};
