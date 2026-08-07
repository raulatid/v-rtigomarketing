import * as THREE from 'three';
import type { AppConfig } from '../config/appConfig';

export function createRenderer(cfg: AppConfig): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: cfg.antialiasEnabled,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Current Three.js (r15x) color management: sRGB output + ACES tone mapping.
  //
  // Note for the terrain transition: this tone maps meshes but NOT the clear
  // colour used for scene.background, so a mesh authored to the background
  // value will not match it. See createTerrainTransition.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  if (cfg.shadowsEnabled) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  return renderer;
}
