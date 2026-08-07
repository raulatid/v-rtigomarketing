import * as THREE from 'three';
import type { AppConfig } from '../config/appConfig';
import type { BoundsRect } from '../config/environmentConfig';
import type { LoadTimings } from '../assets/loadCity';

export interface OverlayInputs {
  renderer: THREE.WebGLRenderer;
  focus: THREE.Vector3;
  cameraHeight: number;
  cameraDistance: number;
  elevationDegrees: number;
  /** Pose azimuth plus user yaw. Unbounded, so it shows turns accumulating. */
  azimuthDegrees: number;
  insideBounds: boolean;
  bounds: BoundsRect;
  footprintClamped: boolean;
  timings: LoadTimings;
}

/**
 * Minimal textual diagnostics overlay. Text is rebuilt at a limited rate
 * (appConfig.overlayUpdatesPerSecond), not every frame. Toggle with F3.
 */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private readonly interval: number;

  private frameCount = 0;
  private fpsAccumulator = 0;
  private fps = 0;
  private frameTimeMs = 0;
  private lastTextUpdate = 0;

  constructor(parent: HTMLElement, cfg: AppConfig) {
    this.interval = 1000 / Math.max(cfg.overlayUpdatesPerSecond, 1);

    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.className = 'overlay';
    parent.appendChild(this.el);

    window.addEventListener('keydown', this.onKeyDown);
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.el.remove();
  }

  /** Call every frame; internally throttles the text rebuild. */
  update(deltaTime: number, now: number, inputs: OverlayInputs): void {
    this.frameCount += 1;
    this.fpsAccumulator += deltaTime;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = this.frameCount / this.fpsAccumulator;
      this.frameTimeMs = (this.fpsAccumulator / this.frameCount) * 1000;
      this.frameCount = 0;
      this.fpsAccumulator = 0;
    }

    if (now - this.lastTextUpdate < this.interval) return;
    this.lastTextUpdate = now;
    this.render(inputs);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    this.toggle();
  };

  private render(i: OverlayInputs): void {
    const info = i.renderer.info;
    const f = i.focus;
    const t = i.timings;
    const b = i.bounds;

    const networkMs = ms(t.loadStartTime, t.networkCompleteTime);
    const parseMs = ms(t.loadStartTime, t.parseCompleteTime);
    const firstFrameMs = ms(t.loadStartTime, t.firstRenderedFrameTime);
    const sizeMb =
      t.bytesLoaded !== null ? (t.bytesLoaded / (1024 * 1024)).toFixed(2) : '?';

    this.el.innerHTML =
      `FPS            ${this.fps.toFixed(0)}\n` +
      `Frame time     ${this.frameTimeMs.toFixed(2)} ms\n` +
      `Draw calls     ${info.render.calls}\n` +
      `Triangles      ${info.render.triangles.toLocaleString()}\n` +
      `Textures       ${info.memory.textures}\n` +
      `Geometries     ${info.memory.geometries}\n` +
      `Programs       ${info.programs?.length ?? 0}\n` +
      `Pixel ratio    ${i.renderer.getPixelRatio()}\n` +
      `Focus X        ${f.x.toFixed(2)}\n` +
      `Focus Z        ${f.z.toFixed(2)}\n` +
      `Cam distance   ${i.cameraDistance.toFixed(1)}\n` +
      `Cam height     ${i.cameraHeight.toFixed(1)}\n` +
      `Elevation      ${i.elevationDegrees.toFixed(1)}°\n` +
      `Azimuth        ${normalizeDegrees(i.azimuthDegrees).toFixed(1)}° (${i.azimuthDegrees.toFixed(0)}° raw)\n` +
      `${boolLine('Inside bounds', i.insideBounds)}\n` +
      `Bounds X       ${b.minX.toFixed(0)} … ${b.maxX.toFixed(0)}\n` +
      `Bounds Z       ${b.minZ.toFixed(0)} … ${b.maxZ.toFixed(0)}\n` +
      `Nav area       ${(b.maxX - b.minX).toFixed(0)} x ${(b.maxZ - b.minZ).toFixed(0)}\n` +
      `${boolLine('Footprint ok', !i.footprintClamped)}\n` +
      `GLB size       ${sizeMb} MB\n` +
      `Network (~)    ${networkMs}\n` +
      `Parse ready    ${parseMs}\n` +
      `First frame    ${firstFrameMs}\n` +
      `[F3] toggle overlay`;
  }
}

/** Wraps to [0, 360) for reading; the raw value is shown alongside. */
function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function ms(start: number, end: number | null): string {
  if (end === null) return '—';
  return `${(end - start).toFixed(0)} ms`;
}

function boolLine(label: string, value: boolean): string {
  const cls = value ? '' : 'bad';
  const text = value ? 'yes' : 'no';
  const padded = label.padEnd(14, ' ');
  return `${padded} <span class="${cls}">${text}</span>`;
}
