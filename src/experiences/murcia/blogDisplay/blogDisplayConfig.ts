/**
 * Where the blog's display hangs, and what it hangs above.
 *
 * The blog's half of what `district/districtConfig.ts` is for the services
 * district: the scene vocabulary and the placement, with no geometry, no shader
 * and no three import anywhere in its graph.
 *
 * ## That last part is a build constraint, not a filing preference
 *
 * `checks/city-asset.ts` reads `BLOG_BUILDING_NODE_NAMES` to assert the cluster is
 * still in the shipped GLB, and the harnesses are bundled for Node with esbuild
 * — which has no loader for `.glsl`. Putting these names beside the display that
 * imports its shaders fails that bundle outright, which is how this module came to
 * exist. Keep it a leaf.
 */

/**
 * Blender names for the cluster the display hangs above.
 *
 * Held here rather than in `createBlogDisplayEntry` for the reason above, and
 * asserted by `checks/city-asset.ts` — so a re-export that renames one fails the
 * build rather than quietly removing the way into the blog.
 *
 * ONE name since the 2026-09-06 re-export, which merged the cluster. It stays a
 * list because what it names is "the meshes the blog's entry point is made of",
 * and that has been more than one before and may be again — every consumer already
 * iterates it, so a second name costs nothing to add back.
 *
 * `findByAnyNameSpelling` is what resolves them, and the reason survives even
 * though the name that needed it has gone: GLTFLoader strips `[ ] . : /` from node
 * names, so a mesh authored as `blog_edificios.001` reaches the runtime as
 * `blog_edificios001`, and the 2026-08-11 audit recorded exactly that biting for
 * real on this cluster.
 */
export const BLOG_BUILDING_NODE_NAMES = ['blog_edificios'] as const;

/**
 * How high above the cluster's TOP the panel's centre floats, in world units.
 *
 * ── ONE OF THE TWO NUMBERS THIS FEATURE CANNOT DERIVE ──
 *
 * The lab shipped 38, and that value is not transferable: it was found by looking,
 * against a 35-degree lens 170 units out and a tower of a particular height. It is
 * a starting point here and nothing more.
 *
 * What IS transferable is the reasoning, and it is worth having because the obvious
 * derivation is wrong. The panel's vertical half-extent is not the clearance it
 * needs: the tilt swings its bottom edge TOWARD the camera, so at a downward viewing
 * angle that edge projects further back than it stands, and a panel with real air
 * under it can still read as resting on the roof. The test is whether the cluster's
 * top face is visible beneath the panel — clearance you cannot see is not clearance.
 *
 * It is therefore COUPLED to `PANEL_TILT_DEGREES` and to the angle the display is
 * seen from, which on this site is Murcia's resting pitch (35 degrees, §39). Change
 * any of the three and re-judge the other two. §34 records the same coupling for the
 * services display, where `PANEL_ELEVATION` and `focusDistanceScale` are "a tuning
 * pair that arithmetic cannot settle and no automated check can see".
 */
export const PANEL_ELEVATION = 38;

/**
 * The panel's fixed lean, in degrees.
 *
 * 45, matching `displayConfig.PANEL_TILT_RADIANS`. Two displays in one city leaning
 * at different angles read as one of them being wrong, and plan 002's refusal of a
 * full billboard applies to both equally: the yaw follows the camera, this never
 * does.
 */
export const PANEL_TILT_DEGREES = 45;
