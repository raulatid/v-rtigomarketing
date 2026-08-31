import * as THREE from 'three';
import type { DistrictContent } from '../../../content/types';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import {
  DistrictInteraction,
  type DistrictInteractionDeps,
  type ServiceSiteInput,
} from '../interaction/DistrictInteraction';
import { createDistrictState } from './districtState';
import {
  FOCO_NODE_NAMES,
  PLAZA_NODE_NAME,
  resolveDisplayContent,
  type DistrictServiceView,
} from './districtConfig';
import { createDistrictFlow, type DistrictFlow } from './flow/districtFlow';
import { createServicesDisplay, type ServicesDisplay } from './display/servicesDisplay';
import { DEFAULT_LOCALE } from './display/displayConfig';
import { DistrictA11y } from './ui/districtA11y';
import { splitServiceCopy } from './serviceCopy';

/**
 * Assembles one services district and wires its four parts to one state.
 *
 * The parts are deliberately unaware of each other:
 *
 *   districtState        the active index, and every legal transition
 *   districtFlow         the ring and connections, which read the index
 *   servicesDisplay      the panel, which reads the copy for that index
 *   DistrictInteraction  pointers, the camera flight, the building highlights
 *   DistrictA11y         the same transitions, reachable by keyboard
 *
 * There is exactly ONE subscription to the state, here, and it pushes to all of
 * them in a fixed order. Four independent subscribers would be four listeners
 * racing on a shared frame, and the symptom of that — the display showing one
 * service while the ring holds another's colour — is the kind of bug that looks
 * like a shader problem for a day.
 *
 * ## What this does not own
 *
 * The GLB. The district's geometry ships inside `city-prototype.glb` and is
 * resolved out of the already-loaded root. Materials are adopted after
 * `applyTrimSheet` has run, which it has: `loadCity` completes before
 * `MurciaExperience.setupDistricts` calls this, so the blanket city material is
 * already on every mesh and `districtFlow` replaces it on the six it takes over.
 */

export interface ServicesDistrictOptions
  extends Omit<
    DistrictInteractionDeps,
    'state' | 'display' | 'districtCenter' | 'districtId' | 'sites'
  > {
  /** The loaded city root. Every node lookup happens against this. */
  root: THREE.Object3D;
  /** Where the keyboard controls mount — the `.murcia-ui` host. */
  container: HTMLElement;
  content: DistrictContent;
  binding: DistrictSceneBinding;
  /** At least one, in tour order. */
  sites: ServiceSiteInput[];
}

export interface ServicesDistrict {
  /** Everything the district adds to the scene, under one node. */
  readonly object3D: THREE.Object3D;
  readonly isEngaged: boolean;
  readonly isFlying: boolean;
  setEnabled(next: boolean): void;
  /** Takes the frame delta. Does not render. */
  update(deltaTime: number): void;
  dispose(): void;
}

export function createServicesDistrict(options: ServicesDistrictOptions): ServicesDistrict {
  const { root, container, content, binding, sites, camera } = options;

  const state = createDistrictState({ serviceCount: sites.length });

  /**
   * The services as everything downstream needs them: copy already split, accent
   * already resolved. Built once — `splitServiceCopy` is pure and the copy is
   * generated at build time, so re-deriving it per frame or per swap would be
   * work for nothing.
   */
  const services: DistrictServiceView[] = sites.map((site) => ({
    id: site.service.id,
    title: site.service.title,
    accent: site.binding.accent,
    ...splitServiceCopy(site.service.body),
  }));

  const flow: DistrictFlow = createDistrictFlow({
    root,
    services: sites.map((site) => ({
      connectionNodeName: site.binding.connectionNodeName,
      accent: site.binding.accent,
      label: site.service.title,
    })),
  });

  const plaza = findByAnyNameSpelling(root, PLAZA_NODE_NAME);
  const plazaBox = new THREE.Box3();
  if (plaza) {
    plazaBox.setFromObject(plaza.object);
  } else {
    console.warn(
      `[district] no "${PLAZA_NODE_NAME}" — the display is placed on the buildings' own ` +
        'bounds instead, and the camera will settle on their centre.',
    );
    for (const site of sites) plazaBox.union(site.lookup.bounds);
  }

  const centre = plazaBox.getCenter(new THREE.Vector3());
  // The plaza's underside, matching what the display's elevation was judged
  // against. It only shifts the whole assembly vertically.
  const groundY = plazaBox.min.y;

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
    locale: DEFAULT_LOCALE,
    // The panel rests facing the way the visitor arrives from, so it is square
    // to them on landing and its ±42° follow clamp is measured from there.
    baseYawDegrees: binding.approachYawDegrees ?? 0,
  });

  const interaction = new DistrictInteraction({
    ...options,
    sites,
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
    flow.setActive(snapshot.districtActive);
    flow.setActiveIndex(snapshot.activeServiceIndex);
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
  flow.setActive(initial.districtActive);
  a11y.update(initial, null);

  return {
    object3D: group,

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
      flow.update(deltaTime);
      display.update(deltaTime, camera);
    },

    dispose() {
      unsubscribe();
      interaction.dispose();
      a11y.dispose();
      display.dispose();
      flow.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
