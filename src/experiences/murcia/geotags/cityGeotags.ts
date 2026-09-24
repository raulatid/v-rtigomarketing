import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { CAMPUS_BUILDING_NODE_NAMES } from '../campus/campusConfig';
import { createGeotags, type GeotagSite, type Geotags } from './createGeotags';
import { BLOG_PANEL_HALF_RISE } from './geotagConfig';

/**
 * The city's two pins: over the services campus and over the blog.
 *
 * Takes each place as the two reads it needs — the shapes are structural, so
 * this folder imports neither `campus/` nor `blogDisplay/` as a module, only
 * the campus's node names to measure how tall it stands. A place that did not
 * load is simply not pinned, as the compass does.
 */
export interface GeotagPlace {
  anchor(out: THREE.Vector3): THREE.Vector3;
  readonly highlightPulse: number;
}

export interface CityGeotagOptions {
  /** The loaded city, for the campus buildings' height. */
  root: THREE.Object3D;
  campus: GeotagPlace | null;
  blog: GeotagPlace | null;
  reducedMotion: boolean;
}

/** The highest point of the named nodes, or null when none is in the city. */
export function topOfNodes(root: THREE.Object3D, names: readonly string[]): number | null {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const name of names) {
    const match = findByAnyNameSpelling(root, name);
    if (match) box.expandByObject(match.object);
  }
  return box.isEmpty() ? null : box.max.y;
}

export function createCityGeotags(options: CityGeotagOptions): Geotags | null {
  const sites: GeotagSite[] = [];

  const campus = options.campus;
  if (campus) {
    // Over the lake, which is the part that is tapped, at the height of the
    // tallest campus building — so it reads as over the campus, not in it.
    const top = topOfNodes(options.root, CAMPUS_BUILDING_NODE_NAMES);
    if (top === null) {
      console.error('[geotags] no campus building found to stand the campus pin over');
    } else {
      sites.push({
        id: 'servicios',
        base: (out) => campus.anchor(out).setY(top),
        pulse: () => campus.highlightPulse,
      });
    }
  }

  const blog = options.blog;
  if (blog) {
    // Over the panel rather than the cluster, so the panel never hides it. Its
    // anchor is the panel's centre.
    sites.push({
      id: 'blog',
      base: (out) => {
        blog.anchor(out);
        return out.setY(out.y + BLOG_PANEL_HALF_RISE);
      },
      pulse: () => blog.highlightPulse,
    });
  }

  if (sites.length === 0) return null;
  return createGeotags(sites, { reducedMotion: options.reducedMotion });
}
