import * as THREE from 'three';
import { worldToClient, type ElementRect } from '../../../interaction/screenSpace';
import { POI, POI_DEFINITIONS, type PoiId } from './poiConfig';

/**
 * The points of interest on screen: a pulsing dot on each place, and its name
 * over it when there is reason to say it.
 *
 * DOM, not meshes, for what the brief asks of them. "Always on top" is what an
 * overlay already is, a constant size on screen is what CSS pixels already are,
 * the ring's pulse is a keyframe the compositor runs, and the label is text in
 * the site's own type on its smoked glass. Each dot is projected once a frame,
 * after whoever moved the camera, as the compass is.
 *
 * Nothing here takes a pointer: the layer is `pointer-events: none` like the
 * rest of `.murcia-ui`, so a dot never steals a press from the canvas it sits
 * over. Picking is `dotAt`, asked by the canvas's own listener
 * (`poiInteraction.ts`) against where the dots were last drawn.
 *
 * A label shows on three reasons, any of them: the first seconds after each
 * arrival in the city (`announce`), a mouse over the dot, or a mouse over the
 * place itself, which each place reports through its own hover.
 */

export interface PoiSite {
  readonly id: PoiId;
  /** Where the dot stands, in world space. Read every frame: places can move. */
  anchor(out: THREE.Vector3): THREE.Vector3;
  /** A mouse is over the place itself. Its own hover, read rather than restated. */
  hovered(): boolean;
}

export interface PoiMarkers {
  /** Names every place for `POI.announceSeconds`. Called on each arrival. */
  announce(): void;
  /** The dot the pointer is over, from the interaction; null for none. */
  setPointed(id: PoiId | null): void;
  /** The dot drawn under a client point, nearest first. Null off every dot, or while hidden. */
  dotAt(clientX: number, clientY: number, touch: boolean): PoiId | null;
  update(delta: number, camera: THREE.Camera, rect: ElementRect, visible: boolean): void;
  dispose(): void;
}

interface DrawnDot {
  readonly id: PoiId;
  readonly x: number;
  readonly y: number;
}

/** The nearest drawn dot within `radius` client px of a point; null when none is. */
export function nearestDot(dots: readonly DrawnDot[], x: number, y: number, radius: number): PoiId | null {
  let best: PoiId | null = null;
  let bestDistance = radius;
  for (const dot of dots) {
    const distance = Math.hypot(dot.x - x, dot.y - y);
    if (distance <= bestDistance) {
      best = dot.id;
      bestDistance = distance;
    }
  }
  return best;
}

interface SiteView {
  readonly site: PoiSite;
  readonly element: HTMLElement;
  /** What was last written, so a still frame writes nothing. */
  transform: string;
  onScreen: boolean;
  labelled: boolean;
}

export function createPoiMarkers(container: HTMLElement, sites: readonly PoiSite[]): PoiMarkers {
  const root = document.createElement('div');
  root.className = 'murcia-poi';
  // The places are reachable by name elsewhere — the header's shortcuts and
  // the campus's own controls. These dots are the eye's version of that.
  root.setAttribute('aria-hidden', 'true');
  root.dataset.visible = 'false';

  const order = (id: PoiId) => POI_DEFINITIONS.findIndex((definition) => definition.id === id);
  const views: SiteView[] = [...sites]
    .sort((a, b) => order(a.id) - order(b.id))
    .map((site, index) => {
      const definition = POI_DEFINITIONS[order(site.id)];
      const element = document.createElement('div');
      element.className = 'murcia-poi__site';
      element.dataset.poi = site.id;
      element.dataset.onScreen = 'false';
      element.dataset.labelled = 'false';
      // The labels arrive in order on an announcement; CSS reads the index.
      element.style.setProperty('--i', String(index));
      const dot = document.createElement('span');
      dot.className = 'murcia-poi__dot';
      const ring = document.createElement('span');
      ring.className = 'murcia-poi__ring';
      dot.append(ring);
      const label = document.createElement('span');
      label.className = 'murcia-poi__label';
      label.textContent = definition?.label ?? site.id;
      element.append(dot, label);
      root.append(element);
      return { site, element, transform: '', onScreen: false, labelled: false };
    });
  container.append(root);

  const drawn: DrawnDot[] = [];
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let visible = false;
  let announceLeft = 0;
  let pointed: PoiId | null = null;

  return {
    announce(): void {
      announceLeft = POI.announceSeconds;
    },

    setPointed(id: PoiId | null): void {
      pointed = id;
    },

    dotAt(clientX: number, clientY: number, touch: boolean): PoiId | null {
      if (!visible) return null;
      return nearestDot(drawn, clientX, clientY, touch ? POI.hitRadiusPx.touch : POI.hitRadiusPx.mouse);
    },

    update(delta: number, camera: THREE.Camera, rect: ElementRect, nextVisible: boolean): void {
      if (nextVisible !== visible) {
        visible = nextVisible;
        root.dataset.visible = String(visible);
      }
      // The announcement runs on the city's clock, and only while it can be
      // seen: an arrival that opens straight into a section keeps nothing back
      // for later, because the caller announces only into the overview.
      announceLeft = Math.max(0, announceLeft - delta);
      const announcing = visible && announceLeft > 0;
      if ((root.dataset.announcing === 'true') !== announcing) root.dataset.announcing = String(announcing);

      drawn.length = 0;
      for (const view of views) {
        // Projected while hidden too, so the first visible frame is already in place.
        const point = worldToClient(rect, camera, view.site.anchor(world), projected);
        const onScreen = point !== null;
        if (onScreen !== view.onScreen) {
          view.onScreen = onScreen;
          view.element.dataset.onScreen = String(onScreen);
        }
        if (point) {
          // Relative to the layer, which is the viewport; a tenth of a pixel is
          // below what the eye sees and keeps a still camera from rewriting.
          const x = Math.round((point.x - rect.left) * 10) / 10;
          const y = Math.round((point.y - rect.top) * 10) / 10;
          const transform = `translate3d(${x}px, ${y}px, 0)`;
          if (transform !== view.transform) {
            view.transform = transform;
            view.element.style.transform = transform;
          }
          drawn.push({ id: view.site.id, x: point.x, y: point.y });
        }
        const labelled = visible && onScreen && (announcing || pointed === view.site.id || view.site.hovered());
        if (labelled !== view.labelled) {
          view.labelled = labelled;
          view.element.dataset.labelled = String(labelled);
        }
      }
    },

    dispose(): void {
      root.remove();
      drawn.length = 0;
    },
  };
}
