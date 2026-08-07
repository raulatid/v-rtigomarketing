import * as THREE from 'three';
import type { AppConfig } from '../config/appConfig';
import type { SceneStateConfig } from '../config/environmentConfig';

export interface SceneBundle {
  scene: THREE.Scene;
  hemisphereLight: THREE.HemisphereLight;
  directionalLight: THREE.DirectionalLight;
  gridHelper: THREE.GridHelper | null;
  /** Applies an environment's Scene-level state. See applySceneState. */
  applySceneState: (state: SceneStateConfig) => void;
  dispose: () => void;
}

/**
 * Creates the single THREE.Scene and its light rig.
 *
 * Background, fog and lighting are Scene-level state: with one Scene shared by
 * every environment they leak across environments, and fog in particular
 * affects every material in the Scene — including the other environment's while
 * both are present during a transition. They are therefore applied here from
 * environment-supplied data, never set by environment code
 * (docs/plans/002 Amendment A3).
 *
 * The light *rig* is created once and only its parameters change. Adding or
 * removing lights would invalidate every material's shader program and stall at
 * exactly the wrong moment.
 */
export function createScene(cfg: AppConfig, initialState: SceneStateConfig): SceneBundle {
  const scene = new THREE.Scene();

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x556070, 1);
  hemisphereLight.position.set(0, 50, 0);
  scene.add(hemisphereLight);

  // Shadow-camera setup used to be configurable here, paired with
  // renderer.shadowMap.enabled in createRenderer. The renderer is the
  // application's now (ADR 001) and does not enable shadows, so configuring
  // the light alone would have produced an option that did nothing. Removed
  // rather than left inert; version control is the archive.
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(directionalLight);

  let gridHelper: THREE.GridHelper | null = null;
  if (cfg.showGridHelper) {
    gridHelper = new THREE.GridHelper(200, 40, 0x4fb0ff, 0x2a3540);
    scene.add(gridHelper);
  }

  const background = new THREE.Color();

  const applySceneState = (state: SceneStateConfig): void => {
    background.setHex(state.backgroundColor);
    scene.background = background;

    scene.fog = state.fog
      ? new THREE.Fog(state.fog.color, state.fog.near, state.fog.far)
      : null;

    hemisphereLight.color.setHex(state.lighting.hemisphere.sky);
    hemisphereLight.groundColor.setHex(state.lighting.hemisphere.ground);
    hemisphereLight.intensity = state.lighting.hemisphere.intensity;

    directionalLight.color.setHex(state.lighting.directional.color);
    directionalLight.intensity = state.lighting.directional.intensity;
    directionalLight.position.set(...state.lighting.directional.position);
  };

  applySceneState(initialState);

  const dispose = (): void => {
    hemisphereLight.dispose();
    directionalLight.dispose();
    if (gridHelper) {
      gridHelper.geometry.dispose();
      disposeMaterial(gridHelper.material);
    }
    scene.clear();
  };

  return {
    scene,
    hemisphereLight,
    directionalLight,
    gridHelper,
    applySceneState,
    dispose,
  };
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}
