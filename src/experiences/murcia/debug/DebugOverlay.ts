import * as THREE from 'three';
import type { AppConfig } from '../config/appConfig';
import type { BoundsRect } from '../config/environmentConfig';
import type { LoadTimings } from '../assets/loadCity';

export interface OverlayInputs {
  renderer: THREE.WebGLRenderer;
  focus: THREE.Vector3;
  cameraHeight: number;
  cameraDistance: number;
  /**
   * The CONFIGURED distance, before the flight dolly — the number that belongs
   * in `murciaConfig`, which `cameraDistance` above is not while a district
   * flight is part-way in. Only the `POSE` line uses it: the `Cam distance`
   * line stays effective, because that one is for watching the dolly work.
   */
  configuredDistance: number;
  elevationDegrees: number;
  /** Effective, so it follows a `?fov=` override and the warp's lens blend. */
  fov: number;
  /** The rig's aim height. Negative aims below the focus and crops the horizon. */
  lookAtHeight: number;
  /** Pose azimuth plus user yaw. Unbounded, so it shows turns accumulating. */
  azimuthDegrees: number;
  insideBounds: boolean;
  bounds: BoundsRect;
  /**
   * Whether any corner ray hit the `maxGroundDistance` clamp instead of the
   * ground. Since 2026-09-04 this is how the overlay knows the frustum passes
   * the horizon, which is the intended resting state rather than a fault — see
   * the line it renders.
   */
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
      `Elevation      ${i.elevationDegrees.toFixed(1)}° (rig)\n` +
      `Eff. pitch     ${effectivePitch(i).toFixed(1)}° (aim ${i.lookAtHeight.toFixed(1)}, fov ${i.fov.toFixed(0)})\n` +
      `Azimuth        ${normalizeDegrees(i.azimuthDegrees).toFixed(1)}° (${i.azimuthDegrees.toFixed(0)}° raw)\n` +
      `${boolLine('Inside bounds', i.insideBounds)}\n` +
      `Bounds X       ${b.minX.toFixed(0)} … ${b.maxX.toFixed(0)}\n` +
      `Bounds Z       ${b.minZ.toFixed(0)} … ${b.maxZ.toFixed(0)}\n` +
      `Nav area       ${(b.maxX - b.minX).toFixed(0)} x ${(b.maxZ - b.minZ).toFixed(0)}\n` +
      // Was `boolLine('Footprint ok', !clamped)`, i.e. red whenever a ray hit
      // the clamp. That was right while the footprint inset the navigable area;
      // Murcia now aims below the horizon on purpose and the clamp is the
      // expected state, so a permanent red light would train the reader to
      // ignore the overlay. It reports what the clamp MEANS instead.
      `Horizon        ${i.footprintClamped ? 'in frame' : 'out of frame'}\n` +
      // ── The line that exists to be copied ──
      //
      // Every field above is here to be WATCHED while something moves. This one
      // is here to be READ ONCE and pasted — into a URL to replay the framing,
      // or to whoever is going to bake it into murciaConfig.
      //
      // So it differs from the lines above in three deliberate ways: it reports
      // the CONFIGURED distance rather than the effective one (the dolly is not
      // part of a resting pose), it normalises the azimuth into [0, 360) so the
      // accumulated turns do not travel with it, and it names each number with
      // the query parameter that sets it rather than with a human label. It is
      // a value, not a report.
      `\nPOSE murcia dist=${i.configuredDistance.toFixed(1)} ` +
      `elev=${i.elevationDegrees.toFixed(1)} ` +
      `azimuth=${normalizeDegrees(i.azimuthDegrees).toFixed(1)} ` +
      `lookAt=${i.lookAtHeight.toFixed(2)} ` +
      `fov=${i.fov.toFixed(1)} ` +
      `focusX=${f.x.toFixed(2)} focusZ=${f.z.toFixed(2)}\n\n` +
      `GLB size       ${sizeMb} MB\n` +
      `Network (~)    ${networkMs}\n` +
      `Parse ready    ${parseMs}\n` +
      `First frame    ${firstFrameMs}\n` +
      `[F3] toggle overlay`;
  }
}

/**
 * The angle the camera actually looks down at, which is what decides whether the
 * frustum passes the horizon — not the rig elevation shown beside it.
 *
 * The two differ because `lookAtHeight` is a constant rather than a fraction of
 * the distance: a positive aim tilts the camera up relative to the rig, a
 * negative one tilts it down. The horizon is in frame once this drops below
 * fov/2, which is the whole reason both numbers are on screen while a pose is
 * being tuned through `?elev=` and `?lookAt=`.
 */
function effectivePitch(i: OverlayInputs): number {
  const ground = Math.sqrt(
    Math.max(i.cameraDistance * i.cameraDistance - i.cameraHeight * i.cameraHeight, 0),
  );
  return (Math.atan2(i.cameraHeight - i.lookAtHeight, ground) * 180) / Math.PI;
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
