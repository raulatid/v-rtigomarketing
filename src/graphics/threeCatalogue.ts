import { Group, Mesh, Points, ShaderMaterial, SphereGeometry } from 'three'

/**
 * Every three class the app writes as a JSX element (`<mesh>`, `<group>`…), and
 * nothing else. SceneCanvas registers it with R3F's `extend`.
 *
 * R3F's `<Canvas>` would register the WHOLE namespace instead — `extend(THREE)`
 * on mount — and that one reference kept all of three in the initial JS
 * whatever the app used: ~132 KB, every visitor, at boot. The build removes
 * that call (`vertigo-three-catalogue` in vite.config.ts), so this list is now
 * the catalogue.
 *
 * A JSX element missing here throws "R3F: X is not part of the THREE
 * namespace!" when it mounts, in dev as in production: the dev server applies
 * the same removal. `threeCatalogue.test.ts` fails first, on any `.tsx` that
 * uses an element this does not list. Objects created with `new` and passed to
 * `<primitive>` need nothing here.
 */
export const THREE_CATALOGUE = { Group, Mesh, Points, ShaderMaterial, SphereGeometry }
