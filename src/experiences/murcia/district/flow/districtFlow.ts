import * as THREE from 'three';
import {
  ACTIVATION_DURATION,
  ACTIVATION_STAGGER,
  BASE_NAVY,
  DISTRICT_FLOW,
  RING_NODE_NAME,
  wrapIndex,
} from '../districtConfig';
import { findByAnyNameSpelling } from '../../assets/nodeNames';
import fragmentShader from '../shaders/fluid/fragment.glsl';
import vertexShader from '../shaders/fluid/vertex.glsl';

/**
 * The district's flowing network: one ring band and one connection wedge per
 * service.
 *
 * ## They have thickness
 *
 * The ring is a box-section band and the connections are slabs, not the flat
 * annulus and quads an earlier export shipped. Two consequences run through this
 * file and the shader it drives: each mesh's vertical extent has to be MEASURED
 * and handed to the shader so the flow can be unrolled over the lip instead of
 * streaking down the walls, and the silhouette is carried by geometry rather
 * than by a radial fade.
 *
 * ## Why one module owns all of them
 *
 * They are one system. They share a colour vocabulary, an activation, a
 * transition constant, a measured centre and a fluid field that has to stay
 * continuous where a connection meets the ring. Splitting the ring from the
 * connections would put five shared things across a module boundary whose only
 * purpose was to make two smaller files — and the colour rule, the part that
 * must never disagree with itself, would be the first thing to drift.
 *
 * The ring/connection difference is DATA, not structure: a harmonic, a travel
 * rate, how much of the flow runs inward, which opacity it answers to. One
 * element record covers both.
 *
 * ## Nothing here is state
 *
 * There is no per-connection selected flag. Every element's colour is recomputed
 * from `districtActive` and `activeServiceIndex` on every frame by
 * `targetColorOf`, so it cannot go stale and two elements cannot disagree about
 * which service is live. What each element carries is IDENTITY — which band it
 * is, which service it belongs to — and that never changes.
 *
 * It observes district state; it never reads a pointer and never decides what is
 * selected.
 *
 * ## Wiring
 *
 * Adopted in `assets/loadCity.ts` AFTER `applyTrimSheet`, for the same reason
 * `attachRiverWater` is: the trim sheet blanket-assigns `MAT_CITY_BUILDINGS` to
 * every mesh, and running earlier would have it overwrite these materials. The
 * meshes it took over are exposed so nothing else has to know which nodes they
 * were.
 */

/** How soft each band's own edges are, as a fraction of its width. */
const EDGE_SOFTNESS = 0.18;

/**
 * How much of the pattern survives outside the district.
 *
 * Zero: outside the district the network is not drawn at all. Raising it to
 * ~0.18 would leave the bands as a faint navy tracery on the ground when the
 * district is closed — worth trying, but it is a change to the inactive state
 * rather than a tuning value, which is why it is a constant here.
 */
const REST_LEVEL = 0;

type FlowKind = 'ring' | 'connection';

/**
 * What each kind of element IS, as opposed to what it is currently doing.
 *
 * `harmonic` must stay a WHOLE number: it is the coefficient on the angle in the
 * travelling phase, and only an integer closes the pattern where the band wraps
 * through ±PI. A connection uses zero — it does not wrap, and its flow runs
 * inward — which is why `radialFlow` carries all of its travel instead.
 */
const IDENTITY: Record<
  FlowKind,
  { harmonic: number; travelScale: number; radialFlow: number; delay: number; renderOrder: number }
> = {
  // The live layer, and the only one: it carries the accent.
  ring: {
    harmonic: 9,
    travelScale: 1,
    radialFlow: 0.18,
    delay: ACTIVATION_STAGGER.ring,
    renderOrder: 1,
  },
  // Runs inward, from the building into the ring. Drawn over the ring, whose
  // outer edge it overlaps, so a selected connection is never buried under it.
  connection: {
    harmonic: 0,
    travelScale: 1.15,
    radialFlow: 1,
    delay: ACTIVATION_STAGGER.connection,
    renderOrder: 2,
  },
};

interface FlowElement {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  kind: FlowKind;
  /** Which service this element belongs to. -1 for the ring. */
  serviceIndex: number;
  delay: number;
  /** The colour actually on screen, eased toward the derived target. */
  current: THREE.Color;
}

/** One service, as the flow needs it. Copy is none of this module's business. */
export interface FlowServiceInput {
  /**
   * Blender object name of the wedge running from that service's building in
   * toward the ring. Comes from `scene/cityDistrictBindings.ts`.
   */
  connectionNodeName: string;
  /** The colour this service claims while it is selected. */
  accent: number;
  /** Diagnostics only, so a missing node names something a human recognises. */
  label: string;
}

export interface DistrictFlowOptions {
  /** The loaded city root. Node lookup happens inside. */
  root: THREE.Object3D;
  /** In tour order — index 0 here is index 0 everywhere. */
  services: readonly FlowServiceInput[];
}

export interface DistrictFlow {
  /**
   * The meshes this took over, so a caller can exclude them from anything that
   * walks the model without having to know which nodes they were.
   */
  readonly meshes: readonly THREE.Mesh[];
  /** Drives the entrance. Idempotent — safe to call on every state change. */
  setActive(active: boolean): void;
  setActiveIndex(index: number): void;
  /**
   * Takes the FRAME DELTA, not elapsed seconds — unlike `createRioWater`, which
   * takes elapsed. The entrance ramp and the colour easing are both rate-based,
   * so this needs the delta and accumulates its own clock from it. Passing
   * elapsed here freezes both.
   */
  update(dt: number): void;
  dispose(): void;
}

export function createDistrictFlow(options: DistrictFlowOptions): DistrictFlow {
  const { root, services } = options;

  // MUST run before anything is measured. If the root is not in a scene yet
  // every `matrixWorld` is still identity — measuring through them would put the
  // district's centre at the origin and every radius off by the offset, with no
  // error anywhere, just a subtly wrong pattern.
  root.updateMatrixWorld(true);

  const ring = findMesh(root, RING_NODE_NAME, 'the ring will not be drawn');

  /**
   * The district axis, in world x/z.
   *
   * Measured off the ring rather than assumed: the district sits at city
   * coordinates, and the connection wedges rotate about a different point than
   * the circular family is modelled around. Taking the axis from a full band is
   * exact, and every mesh then measures its radii about the same point — which
   * is what keeps the field continuous where a connection crosses the ring.
   */
  const centre = new THREE.Vector2();
  if (ring) {
    const box = new THREE.Box3().setFromObject(ring);
    const middle = box.getCenter(new THREE.Vector3());
    centre.set(middle.x, middle.z);
  }

  const baseColor = new THREE.Color().setHex(BASE_NAVY, THREE.SRGBColorSpace);
  const accents = services.map((service) =>
    new THREE.Color().setHex(service.accent, THREE.SRGBColorSpace),
  );

  const elements: FlowElement[] = [];

  const adopt = (mesh: THREE.Mesh, kind: FlowKind, serviceIndex: number): void => {
    const identity = IDENTITY[kind];

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      // Scene-level, and free while Murcia's fog is null. Same opt-in as rio.
      fog: true,
      // These lie on the plaza and the ground; writing depth would make them
      // occlude what they are drawn on and fight for depth where they should not.
      depthWrite: false,
      // Normal rather than additive: the city is lit, and additive saturates to
      // white on a light ground and loses the pattern entirely.
      blending: THREE.NormalBlending,
      // A flipped normal on a thin slab under FrontSide renders nothing at all,
      // which reads as a broken shader rather than as the export problem it is.
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uActivation: { value: 0 },
        uColor: { value: baseColor.clone() },
        uOpacity: {
          value:
            kind === 'connection' ? DISTRICT_FLOW.connectionOpacity : DISTRICT_FLOW.ringOpacity,
        },
        uIntensity: { value: DISTRICT_FLOW.intensity },
        uFlowSpeed: { value: DISTRICT_FLOW.speed },
        uFlowScale: { value: DISTRICT_FLOW.scale },
        uWarp: { value: DISTRICT_FLOW.warp },
        uTravelScale: { value: identity.travelScale },
        uAngularHarmonic: { value: identity.harmonic },
        uRadialFlow: { value: identity.radialFlow },
        // One shared Vector2 instance across every element: there is exactly one
        // district axis, and a copy per mesh is a chance for them to disagree.
        uCenter: { value: centre },
        uRadialRange: { value: measureRadialRange(mesh, centre) },
        // The mesh's own vertical extent. The shader needs it to unroll the
        // profile: without it a vertical wall samples one point of the flow
        // field down its whole height and renders as a streak.
        uHeightRange: { value: measureHeightRange(mesh) },
        uAngularRange: {
          value: kind === 'connection' ? measureAngularRange(mesh) : new THREE.Vector2(0, 0),
        },
        uEdgeSoftness: { value: EDGE_SOFTNESS },
        uEdgeEmphasis: { value: DISTRICT_FLOW.edgeEmphasis },
        uRestLevel: { value: REST_LEVEL },
      },
    });

    // The material being replaced is the shared `MAT_CITY_BUILDINGS` the trim
    // sheet assigned. It is NOT disposed here: every other building in the city
    // is still using it.
    mesh.material = material;
    mesh.renderOrder = identity.renderOrder;
    // Not a district target, and never should become one by accident: a
    // double-sided band lying at ground level would swallow clicks across the
    // whole plaza if anything ever raycast the scene rather than an allowlist.
    mesh.raycast = () => {};

    elements.push({
      mesh,
      material,
      kind,
      serviceIndex,
      delay: identity.delay,
      current: baseColor.clone(),
    });
  };

  if (ring) adopt(ring, 'ring', -1);

  services.forEach((service, index) => {
    const match = findByAnyNameSpelling(root, service.connectionNodeName, isMesh);
    if (!match) {
      console.warn(
        `[district] no "${service.connectionNodeName}" mesh —` +
          ` ${service.label} will have no connection.`,
      );
      return;
    }
    adopt(match.object as THREE.Mesh, 'connection', index);
  });

  let districtActive = false;
  let activeIndex = 0;
  /** One clock for the whole entrance, 0..1 over `ACTIVATION_DURATION`. */
  let entrance = 0;
  let entranceTarget = 0;
  let elapsed = 0;

  /**
   * The whole colour rule, and the only place it is written down.
   *
   * Outside the district everything rests at navy, so re-entering blooms into
   * the accent rather than snapping to it. Inside, the ring carries the active
   * service's accent and the unselected connections hold navy — which is the
   * only thing left holding the base colour.
   */
  const targetColorOf = (element: FlowElement): THREE.Color => {
    if (!districtActive) return baseColor;

    const index = wrapIndex(activeIndex, accents.length);
    if (element.kind === 'ring') return accents[index] ?? baseColor;
    return element.serviceIndex === index ? (accents[index] ?? baseColor) : baseColor;
  };

  return {
    meshes: elements.map((element) => element.mesh),

    setActive(active) {
      districtActive = active;
      entranceTarget = active ? 1 : 0;
    },

    setActiveIndex(index) {
      activeIndex = wrapIndex(index, accents.length);
    },

    update(dt) {
      elapsed += dt;

      // One linear ramp for the whole entrance, over the duration the display
      // also uses, so the network and the copy arrive together.
      if (entrance !== entranceTarget) {
        const step = dt / ACTIVATION_DURATION;
        entrance =
          entranceTarget > entrance
            ? Math.min(entranceTarget, entrance + step)
            : Math.max(entranceTarget, entrance - step);
      }

      // Frame-rate independent, so the transition does not run quicker on a
      // faster machine — the same reason the display's follow uses it.
      const smoothing = 1 - Math.exp(-dt / Math.max(DISTRICT_FLOW.transition, 0.001));

      for (const element of elements) {
        const uniforms = element.material.uniforms;
        uniforms['uTime'].value = elapsed;

        // Every element finishes at `entrance = 1` and they differ only in when
        // they start: the ring immediately, the connections behind it. Leaving
        // the district drains them in the reverse order for free, because the
        // same expression runs backwards.
        const staged = (entrance - element.delay) / Math.max(1 - element.delay, 1e-3);
        uniforms['uActivation'].value = Math.min(1, Math.max(0, staged));

        element.current.lerp(targetColorOf(element), smoothing);
        (uniforms['uColor'].value as THREE.Color).copy(element.current);
      }
    },

    dispose() {
      // ONLY the materials. The geometry belongs to the loaded city and is
      // released by its disposal walk; freeing it here would free it twice and,
      // worse, imply this module owns something it does not.
      for (const element of elements) element.material.dispose();
    },
  };
}

const isMesh = (object: THREE.Object3D): boolean => (object as THREE.Mesh).isMesh === true;

function findMesh(
  root: THREE.Object3D,
  nodeName: string,
  consequence: string,
): THREE.Mesh | undefined {
  const match = findByAnyNameSpelling(root, nodeName, isMesh);
  if (!match) {
    console.warn(`[district] no "${nodeName}" mesh — ${consequence}.`);
    return undefined;
  }
  return match.object as THREE.Mesh;
}

/**
 * The smallest and largest radius in a mesh, measured about the district axis.
 *
 * In WORLD space and about a given centre: each mesh's own object origin is
 * neither the district axis nor the same point for a ring and a connection.
 *
 * Read off the position attribute rather than the bounding box, because a box
 * around an annulus says nothing at all about where its hole is.
 */
function measureRadialRange(mesh: THREE.Mesh, centre: THREE.Vector2): THREE.Vector2 {
  const position = mesh.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let smallest = Infinity;
  let largest = 0;

  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const radius = Math.hypot(point.x - centre.x, point.z - centre.y);
    if (radius < smallest) smallest = radius;
    if (radius > largest) largest = radius;
  }

  return Number.isFinite(smallest)
    ? new THREE.Vector2(smallest, largest)
    : new THREE.Vector2(0, 1);
}

/**
 * A mesh's lowest and highest world Y.
 *
 * The bounding box is enough here, unlike the radial range: a box around an
 * annulus says nothing about where its hole is, but it says exactly where the
 * top and bottom of a band are, which is all the shader needs to unroll the
 * profile.
 */
function measureHeightRange(mesh: THREE.Mesh): THREE.Vector2 {
  const box = new THREE.Box3().setFromObject(mesh);
  // A degenerate range would divide by zero in the shader. A flat mesh falls
  // back to a unit span, and the unrolling term then multiplies out to nothing,
  // which is exactly right for it.
  const top = box.max.y > box.min.y ? box.max.y : box.min.y + 1;
  return new THREE.Vector2(box.min.y, top);
}

/**
 * A wedge's angular centre and half-width, in its OWN object space.
 *
 * Object space on purpose: the connections are one authored patch placed by
 * several different rotations, so in their own frame every one of them sits at
 * about +45 degrees — comfortably clear of the wrap, which a world-space
 * measurement could not promise.
 *
 * The centre is a circular mean (the direction of the summed unit vectors)
 * rather than an average of angles, so it stays correct even for a patch that
 * did straddle ±PI.
 */
function measureAngularRange(mesh: THREE.Mesh): THREE.Vector2 {
  const position = mesh.geometry.getAttribute('position');
  let sumX = 0;
  let sumZ = 0;

  for (let i = 0; i < position.count; i += 1) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    sumX += Math.cos(angle);
    sumZ += Math.sin(angle);
  }

  const centreAngle = Math.atan2(sumZ, sumX);
  let halfWidth = 0;

  for (let i = 0; i < position.count; i += 1) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    // Wrapped into -PI..PI, so a patch that did straddle the seam still measures
    // its true width rather than very nearly the whole circle.
    const delta = Math.abs(
      Math.atan2(Math.sin(angle - centreAngle), Math.cos(angle - centreAngle)),
    );
    if (delta > halfWidth) halfWidth = delta;
  }

  return new THREE.Vector2(centreAngle, Math.max(halfWidth, 1e-3));
}
