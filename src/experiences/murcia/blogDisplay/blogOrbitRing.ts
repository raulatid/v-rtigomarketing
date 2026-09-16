import * as THREE from 'three';

const MESSAGE = 'NUESTRO BLOG · CLICA Y MIRA';
const HEIGHT = 3;
const SEGMENTS = 128;
/** World units per second: constant reading speed across viewport shapes. */
const TEXT_SPEED = 1.8;

/** A physical elliptical ribbon beneath the display. Only its text travels. */
export function createBlogOrbitRing(panelWidth: number, reducedMotion: boolean) {
  const object = new THREE.Group();
  object.name = 'blog-orbit-ring';
  object.position.y = -13.5;
  object.rotation.z = THREE.MathUtils.degToRad(-4);
  let disposed = false;
  let texture: THREE.CanvasTexture | null = null;
  let circumference = 1;
  let offset = 0;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, toneMapped: false,
    side: THREE.FrontSide,
  });
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0x161c25, transparent: true, opacity: 0, side: THREE.BackSide,
  });
  const band = new THREE.Mesh(new THREE.BufferGeometry(), material);
  band.name = 'blog-orbit-invitation';
  const inner = new THREE.Mesh(new THREE.BufferGeometry(), innerMaterial);
  object.add(band, inner);
  object.visible = false;

  const resize = (width: number) => {
    const rx = Math.max(12, width * 0.48 + 2);
    const rz = 6;
    const geometry = new THREE.CylinderGeometry(1, 1, HEIGHT, SEGMENTS, 1, true);
    geometry.scale(rx, 1, rz);
    // Arc-length UVs keep the letters evenly spaced around an ellipse.
    const lengths = [0];
    for (let i = 1; i <= SEGMENTS; i++) {
      const a = (i - 1) / SEGMENTS * Math.PI * 2;
      const b = i / SEGMENTS * Math.PI * 2;
      lengths.push(lengths[i - 1]! + Math.hypot(rx * (Math.sin(b) - Math.sin(a)), rz * (Math.cos(b) - Math.cos(a))));
    }
    circumference = lengths[SEGMENTS]!;
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, lengths[i % (SEGMENTS + 1)]! / circumference);
    band.geometry.dispose();
    inner.geometry.dispose();
    band.geometry = geometry;
    inner.geometry = geometry.clone();
    inner.scale.set(0.992, 1, 0.992);
    if (texture) texture.repeat.x = Math.max(1, Math.round(circumference / (HEIGHT * 13)));
  };

  // Canvas is a texture source only: no HTML element is mounted over the scene.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (context) {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      material.map = texture;
      const paint = () => {
        if (disposed) return;
        context.fillStyle = '#101620';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = '600 96px "Vertigo Display", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.fillText(MESSAGE, canvas.width / 2, canvas.height / 2, canvas.width - 180);
        texture!.needsUpdate = true;
      };
      paint();
      void document.fonts?.load('600 96px "Vertigo Display"', MESSAGE).then(paint).catch(() => {});
    }
  }
  resize(panelWidth);

  return {
    object,
    target: band,
    resize,
    setPresence(value: number) {
      const opacity = THREE.MathUtils.clamp(value, 0, 1);
      material.opacity = opacity;
      innerMaterial.opacity = opacity;
      object.visible = opacity > 0.01;
    },
    update(dt: number) {
      if (reducedMotion || !object.visible) return;
      offset = (offset + Math.max(0, dt) * TEXT_SPEED * (texture?.repeat.x ?? 1) / circumference) % 1;
      if (texture) texture.offset.x = -offset;
    },
    dispose() {
      disposed = true;
      band.geometry.dispose();
      inner.geometry.dispose();
      material.dispose();
      innerMaterial.dispose();
      texture?.dispose();
    },
  };
}
