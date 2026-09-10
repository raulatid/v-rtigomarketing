import * as THREE from 'three';
import type { DistrictContent } from '../../../content/types';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { DistrictInteraction, type DistrictInteractionDeps } from '../interaction/DistrictInteraction';
import { resolveDistrict } from '../interaction/resolveDistrict';
import { createDistrictState } from './districtState';
import {
  BUILDING_NODE_NAMES,
  FOCO_NODE_NAMES,
  PLAZA_NODE_NAME,
  resolveDisplayContent,
  type DistrictServiceView,
} from './districtConfig';
import { createServicesDisplay, type ServicesDisplay } from './display/servicesDisplay';
import { DEFAULT_LOCALE, type DisplayControl } from './display/displayConfig';
import { DistrictA11y } from './ui/districtA11y';
import { splitServiceCopy } from './serviceCopy';

/**
 * Assembles one services district and wires its parts to one state.
 *
 * The parts are deliberately unaware of each other:
 *
 *   districtState        the active index, and every legal transition
 *   servicesDisplay      the panel, which reads the copy for that index
 *   DistrictInteraction  pointers, the camera flight, the cluster highlight
 *   DistrictA11y         the same transitions, reachable by keyboard
 *
 * `districtFlow` was a fifth until 2026-09-06. It drew the shader ring and the
 * five connection wedges, and the re-export that replaced fifteen district nodes
 * with four left it nothing to find, so it was deleted rather than left warning
 * once per missing name on every load.
 *
 * There is exactly ONE subscription to the state, here, and it pushes to all of
 * them in a fixed order. Independent subscribers would be listeners racing on a
 * shared frame, and the symptom of that — the display showing one service while
 * something else holds another's — is the kind of bug that looks like a shader
 * problem for a day.
 *
 * ## What this does not own
 *
 * The GLB. The district's geometry ships inside `city-prototype.glb` and is
 * resolved out of the already-loaded root. Materials are adopted after
 * `applyTrimSheet` has run, which it has: `loadCity` completes before
 * `MurciaExperience.setupDistricts` calls this, so the blanket city material is
 * already on every mesh by the time the highlight clones it.
 */

export interface ServicesDistrictOptions
  extends Omit<
    DistrictInteractionDeps,
    'state' | 'display' | 'districtCenter' | 'districtId' | 'buildings'
  > {
  /** The loaded city root. Every node lookup happens against this. */
  root: THREE.Object3D;
  /** Where the keyboard controls mount — the `.murcia-ui` host. */
  container: HTMLElement;
  content: DistrictContent;
  binding: DistrictSceneBinding;
}

export interface ServicesDistrict {
  /** Everything the district adds to the scene, under one node. */
  readonly object3D: THREE.Object3D;
  readonly isEngaged: boolean;
  readonly isFlying: boolean;
  /**
   * The point the compass bears on, copied into `out`.
   *
   * The district's own skyline: the plaza centre, at the height of its tallest
   * building. Read from the GLB at construction, like everything else about
   * where this district is.
   */
  anchor(out: THREE.Vector3): THREE.Vector3;
  /** Where the first building is on screen. Test seam — see DistrictInteraction. */
  screenPoint(): { x: number; y: number } | null;
  /** Where a display control's drawn centre is on screen. Test seam — see DistrictInteraction. */
  controlPoint(control: DisplayControl): { x: number; y: number } | null;
  /**
   * Leaves the district if it is holding the viewer. A no-op otherwise.
   *
   * The second touch-native way out (the first is the display's own close): the
   * scene navigation calls this when a pinch toward the way out arrives while
   * the district is focused. The same transition as Escape, the a11y VOLVER and
   * the X — one exit, reached four ways.
   */
  releaseFocus(): void;
  setEnabled(next: boolean): void;
  /** Takes the frame delta. Does not render. */
  update(deltaTime: number): void;
  dispose(): void;
}

/**
 * Builds the district, or reports why it cannot and returns null.
 *
 * Null rather than a throw or a half-built object: a city exported without the
 * cluster should still run, and the caller's only sensible response is to leave
 * the district out — which is what the per-service resolution used to do one
 * building at a time.
 */
export function createServicesDistrict(
  options: ServicesDistrictOptions,
): ServicesDistrict | null {
  const { root, container, content, binding, camera } = options;

  // ONE lookup for the whole cluster. Identified by name by contract, so no tag
  // (which also keeps the "add a custom property" nag off) and no spatial
  // fallback — a district found by guessing at a rectangle is a district in the
  // wrong place.
  const buildings = resolveDistrict(root, {
    id: content.id,
    tag: '',
    nodeNames: [...BUILDING_NODE_NAMES],
    allowSpatialFallback: false,
  });
  if (buildings.warnings.length > 0) {
    console.warn(`[district] ${content.id}:\n- ` + buildings.warnings.join('\n- '));
  }
  if (buildings.source === 'not-found' || buildings.meshes.length === 0) {
    console.error(
      `[district] "${content.id}" has no locatable buildings (${BUILDING_NODE_NAMES.join(', ')}). ` +
        'It is inert.',
    );
    return null;
  }
  if (content.services.length === 0) {
    console.error(`[district] "${content.id}" has no published services. It is inert.`);
    return null;
  }

  const state = createDistrictState({ serviceCount: content.services.length });

  /**
   * The services as everything downstream needs them, copy already split. Built
   * once — `splitServiceCopy` is pure and the copy is generated at build time,
   * so re-deriving it per frame or per swap would be work for nothing.
   *
   * Content order is the tour order, and it is the ONLY order now: nothing binds
   * a service to a building any more, so there is no table to disagree with it.
   */
  const services: DistrictServiceView[] = content.services.map((service) => ({
    id: service.id,
    title: service.title,
    ...splitServiceCopy(service.body),
  }));

  const plaza = findByAnyNameSpelling(root, PLAZA_NODE_NAME);
  const plazaBox = new THREE.Box3();
  if (plaza) {
    plazaBox.setFromObject(plaza.object);
  } else {
    console.warn(
      `[district] no "${PLAZA_NODE_NAME}" — the display is placed on the buildings' own ` +
        'bounds instead, and the camera will settle on their centre.',
    );
    plazaBox.copy(buildings.bounds);
  }

  const centre = plazaBox.getCenter(new THREE.Vector3());
  // The plaza's underside, matching what the display's elevation was judged
  // against. It only shifts the whole assembly vertically.
  const groundY = plazaBox.min.y;

  // The tallest thing in the district, which is where `anchor()` sits. The
  // plaza is a floor, so its own box tops out at the ground; the buildings' own
  // bounds are what "above the district" means.
  const skylineY = Math.max(groundY, buildings.bounds.max.y);

  const focos = FOCO_NODE_NAMES.map((name) => findByAnyNameSpelling(root, name))
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .map((match) => match.object);
  if (focos.length !== FOCO_NODE_NAMES.length) {
    console.warn(
      `[district] found ${focos.length} of ${FOCO_NODE_NAMES.length} focos; the display ` +
        'will be projected by fewer beams than the export intends.',
    );
  }

  const display: ServicesDisplay = createServicesDisplay({
    centre,
    groundY,
    focos,
    // The panel rests facing the way the visitor arrives from, so it is square
    // to them on landing and its ±42° follow clamp is measured from there.
    baseYawDegrees: binding.approachYawDegrees ?? 0,
  });

  const interaction = new DistrictInteraction({
    ...options,
    buildings,
    state,
    display,
    districtCenter: { x: centre.x, z: centre.z },
    districtId: content.id,
  });

  const a11y = new DistrictA11y(container, content.label, DEFAULT_LOCALE, {
    onEnter: () => state.enterDistrict(),
    onPrevious: () => state.previousService(),
    onNext: () => state.nextService(),
    onDetailToggle: () =>
      state.get().detailOpen ? state.closeDetail() : state.openDetail(),
    onBack: () => state.exitDistrict(),
  });

  const group = new THREE.Group();
  group.name = `ServicesDistrict:${content.id}`;
  group.add(interaction.object3D, display.object);

  // The single subscription. Order is fixed and meaningful: the interaction
  // first, because it may start a camera flight the others do not care about;
  // then the world, then the copy, then the announcement — so what is said aloud
  // is what has just been made true.
  const unsubscribe = state.subscribe((snapshot) => {
    interaction.applySnapshot(snapshot);
    display.setContent(resolveDisplayContent(snapshot, services, content.label));
    display.setDetailOpen(snapshot.detailOpen);
    a11y.update(snapshot, viewFor(snapshot.activeServiceIndex));
  });

  function viewFor(index: number): { eyebrow: string; title: string; summary: string } | null {
    const resolved = resolveDisplayContent(
      { districtActive: true, activeServiceIndex: index },
      services,
      content.label,
    );
    return resolved && {
      eyebrow: resolved.eyebrow,
      title: resolved.title,
      summary: resolved.summary,
    };
  }

  // Seeded, so the world starts in the state the store says it is in rather than
  // in whatever each part happened to be constructed at.
  const initial = state.get();
  interaction.applySnapshot(initial);
  a11y.update(initial, null);

  return {
    object3D: group,

    anchor(out: THREE.Vector3): THREE.Vector3 {
      return out.set(centre.x, skylineY, centre.z);
    },

    screenPoint() {
      return interaction.screenPoint();
    },

    controlPoint(control) {
      return interaction.controlPoint(control);
    },

    releaseFocus() {
      if (state.get().districtActive) state.exitDistrict();
    },

    get isEngaged() {
      return interaction.isEngaged;
    },

    get isFlying() {
      return interaction.isFlying;
    },

    setEnabled(next) {
      interaction.setEnabled(next);
    },

    update(deltaTime) {
      interaction.update(deltaTime);
      display.update(deltaTime, camera);
    },

    dispose() {
      unsubscribe();
      interaction.dispose();
      a11y.dispose();
      display.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
