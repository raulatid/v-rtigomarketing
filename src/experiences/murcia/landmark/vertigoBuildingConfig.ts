/**
 * The Vertigo building — the client's own tower in the city, and the one
 * landmark whose parts the runtime touches by name.
 *
 * ## The contract the GLB keeps (plan 019 §1, §2)
 *
 * Five nodes, all direct children of the scene root, all exported with NO
 * rotation and NO scale — identity, so the turn below composes onto nothing
 * and a re-export that ever tilts the logo keeps its tilt through
 * `createTowerLogo` rather than losing it. Positions are world units.
 *
 *   `edificio-vertigo-estructura`    the tower, pivot at its BASE at
 *                                    (-275.72, 1.47, 299.08), 45 units tall,
 *                                    square in plan. Never touched.
 *   `edificio-vertigo-banner-panel`  the screen: a four-sided box band with no
 *                                    top or bottom, pivot at its centre on the
 *                                    tower's axis at y 37.09, ~9.8 wide and
 *                                    ~5.3 tall per face (each face ~1.84:1).
 *   `edificio-vertigo-leds`          the LED sleeve around the band, same
 *                                    pivot, a hair larger on every side.
 *   `logo-V`                         THE LOGO, lower half: the isotype's V,
 *                                    pivot at its own centre at
 *                                    (-276.01, 50.28, 299.76).
 *   `logo-curva`                     the logo's upper half: the isotype's arc,
 *                                    pivot at its own centre at
 *                                    (-276.00, 53.76, 299.78).
 *
 * ## The logo turns
 *
 * The two curve meshes are the same two the header's mark is built from
 * (`vertigo-isotipo-3d.glb`), standing on the tower's cap. They turn about
 * their own local +Y, and because their pivots share (x, z) to within 0.02 of
 * a unit they turn as one piece — the pivot being at each mesh's OWN CENTRE is
 * what makes "rotate about local Y" mean "spin in place" with no offset
 * arithmetic. That is the one thing an export must not move: a pivot dragged
 * to a corner would make the mark orbit its post instead of turning on it.
 *
 * They were `BézierCurve` and `BézierCurve.001` — Blender's defaults for a
 * curve object — until the 2026-09-06 re-export took the contract's own advice
 * and named them. Both pivots came across to within 0.01 of a unit, so this was
 * a rename and nothing else; the turn is unchanged.
 *
 * Two things got better and are worth keeping. Neither name carries a dot now,
 * so neither depends on GLTFLoader's reserved-character stripping and
 * `findByAnyNameSpelling` has nothing to disambiguate. And a name that says
 * which half it is survives the next export by meaning something, where a
 * default did not. `checks/city-asset.ts` §5d still fails the build when the
 * file and this list disagree, which is what caught the rename.
 *
 * ## The banner is the band's four side faces
 *
 * Its authored UVs are a top-down projection (every side face collapses onto
 * one edge of the UV square), so the runtime maps the image onto each face
 * from the geometry itself — see `attachBanner` — and the contract asks only
 * that the band stay an axis-aligned box in its own local frame, with normals
 * facing OUT. Nothing here depends on how the .blend unwraps it. The band and
 * its sleeve do not move.
 *
 * Every node is optional at runtime — a missing one warns and the city loads
 * without it — and every one is asserted on the file by
 * `npm run check:asset:contract`, exactly as for the river and the blog
 * cluster.
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
  /** The face set the banner image is applied to. */
  bannerNodeName: string;
  /**
   * What the band shows until the client uploads a banner in the Studio.
   * Root-absolute like `modelPath`, and drawn through exactly the path the
   * real upload will take — see `attachBanner`. 1600×800, the 2:1 the media
   * rule in `siteSettings.collection.ts` calls ideal.
   */
  placeholderImage: string;
  logo: TowerLogoConfig;
}

export const VERTIGO_BUILDING: VertigoBuildingConfig = {
  logoNodeNames: ['logo-V', 'logo-curva'],
  bannerNodeName: 'edificio-vertigo-banner-panel',
  placeholderImage: '/textures/murcia/vertigo-banner-placeholder.png',
  logo: { axis: 'y', angularSpeedRadPerSec: 0.35 },
};
