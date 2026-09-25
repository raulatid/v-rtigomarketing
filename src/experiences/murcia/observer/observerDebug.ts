import * as THREE from 'three';
import type { Observer } from './createObserver';
import { AUTHORING_MARKERS, type ViewpointMarker } from './observerAuthoring';
import { cryptoRandom, scatterTargets } from './observerScatter';
import {
  compositionError,
  projectMarkers,
  PROJECTION_STRIDE,
  type CompositionError,
} from './observerProjection';
import { claimWithToken, type ViewClient, type ViewReply } from './viewClient';

/**
 * Authoring tools for the vantage points. Development only.
 *
 * Constructed by `MurciaExperience` behind `DEBUG_TOOLS_ENABLED`, the
 * `debugTools` option and `?align=1`. The literal is what keeps this module —
 * and the authoring anchors it imports — out of a production bundle; nothing
 * here guards itself.
 *
 * Three things:
 *
 *  - a 2D overlay over the canvas: each anchor's projection, the line to its
 *    `expectedNdc`, the pixel error, the rest detector's state, and the
 *    server's last verdict (sent only when the dev server runs with
 *    `VIEW_DEBUG=1`, since the pose is not in the browser);
 *  - one `THREE.Points` marking the anchors in the world (one draw call);
 *  - `window.__vertigoAlign` — `pick()`, `capture()`, `scatter()`, `status()`,
 *    `claim()`, `reset()` — because the console is where this repo's other seams already
 *    live, and a key binding would be one more window-level listener.
 *
 * The overlay redraws every frame rather than at the F3 overlay's cadence:
 * aligning anchors against a dot that lags by a quarter second is not possible.
 */
export interface ObserverDebugOptions {
  observer: Observer;
  viewClient: ViewClient;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  /** What `pick()` raycasts against: the city. */
  root: THREE.Object3D;
  canvas: HTMLCanvasElement;
  /** Rig state to reproduce the framing — focus, yaw, zoom depth. */
  describeRig: () => Record<string, number>;
}

export interface ObserverDebug {
  update(): void;
  /** The server's answer to the last report. */
  setReply(reply: ViewReply): void;
  dispose(): void;
}

interface AlignSeam {
  pick(ndcX?: number, ndcY?: number): [number, number, number] | null;
  capture(): unknown;
  /** Random anchors cast from the current pose; see `observerScatter.ts`. Then captures. */
  scatter(count?: number): unknown;
  status(): unknown;
  claim(email: string): Promise<string | null>;
  reset(): void;
}

/** Starting tolerances for a captured stage, to be tightened in the authoring session. */
const CAPTURE_TOLERANCE = { positionUnits: 6, angleDegrees: 3, fovDegrees: 0.5 };

// ── scatter() ──
/** Targets fall within ±0.6 half-heights vertically. */
const SCATTER_EXTENT = 0.6;
/** And fit an upright phone horizontally (about 9:19.5). */
const SCATTER_MIN_ASPECT = 9 / 19.5;
/** No two targets closer than 12% of the viewport height. */
const SCATTER_MIN_SEPARATION = 0.12;
/** World units. Below this a hit is the ground plane, not a building detail. */
const MIN_ANCHOR_HEIGHT = 3;
/**
 * Farthest anchor over nearest. Without real depth spread the figure is nearly
 * a flat decal, legible from a wide cone of poses — the opposite of the point.
 */
const MIN_DEPTH_RATIO = 1.5;
const SCATTER_ROUNDS = 40;

const MARKER_COLOUR = '#ff3df2';
const TARGET_COLOUR = '#3dfcff';
const INSIDE_COLOUR = '#7bff8e';

export function createObserverDebug(options: ObserverDebugOptions): ObserverDebug {
  const { observer, viewClient, camera, scene, root, canvas } = options;
  // Replaceable at runtime by `scatter()`, so a new composition can be judged
  // before it is pasted into `observerAuthoring.ts`.
  let markers: readonly ViewpointMarker[] = AUTHORING_MARKERS;
  let projected = new Float32Array(markers.length * PROJECTION_STRIDE);
  const error: CompositionError = { meanPx: 0, maxPx: 0, scored: 0 };
  let lastReply: ViewReply | null = null;

  // ── World helper ──
  const geometry = new THREE.BufferGeometry();
  function setMarkers(next: readonly ViewpointMarker[]): void {
    markers = next;
    projected = new Float32Array(markers.length * PROJECTION_STRIDE);
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(markers.flatMap((m) => [...m.position]), 3),
    );
  }
  setMarkers(markers);
  const material = new THREE.PointsMaterial({
    color: MARKER_COLOUR,
    size: 7,
    sizeAttenuation: false,
    depthTest: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'ObserverAnchorsHelper';
  points.renderOrder = 999;
  points.frustumCulled = false;
  scene.add(points);

  // ── Screen overlay ──
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;';
  document.body.appendChild(overlay);
  const ctx = overlay.getContext('2d');

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const forward = new THREE.Vector3();

  function verdictLines(): string[] {
    const dbg = lastReply?.dbg as
      | { stage?: number; held?: number; inside?: boolean; distance?: number; angleDegrees?: number; fovDelta?: number }
      | undefined;
    if (!lastReply) return ['server   no report yet'];
    if (!dbg) return ['server   replied (start the dev server with VIEW_DEBUG=1 for the verdict)'];
    if (dbg.inside === undefined) return [`server   held stage ${dbg.held} — no further stage`];
    return [
      `server   stage ${dbg.stage}: ${dbg.inside ? 'INSIDE' : 'miss'}  (held ${dbg.held})`,
      `         pos ${fmt(dbg.distance)}  angle ${fmt(dbg.angleDegrees)}°  fov ${fmt(dbg.fovDelta)}`,
    ];
  }

  function update(): void {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }

    projectMarkers(camera, markers, projected);
    compositionError(projected, markers, rect.width, rect.height, error);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const toX = (x: number) => ((x + 1) / 2) * rect.width;
    const toY = (y: number) => ((1 - y) / 2) * rect.height;

    // Screen centre.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // The figure as the anchors currently draw it, in authoring order.
    ctx.strokeStyle = 'rgba(255,61,242,0.45)';
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < markers.length; i++) {
      const o = i * PROJECTION_STRIDE;
      if (projected[o + 2] === 0) {
        open = false;
        continue;
      }
      if (open) ctx.lineTo(toX(projected[o]), toY(projected[o + 1]));
      else ctx.moveTo(toX(projected[o]), toY(projected[o + 1]));
      open = true;
    }
    ctx.stroke();

    ctx.font = '11px monospace';
    for (let i = 0; i < markers.length; i++) {
      const o = i * PROJECTION_STRIDE;
      const expected = markers[i].expectedNdc;
      if (expected) {
        const ex = toX(expected[0]);
        const ey = toY(expected[1]);
        ctx.strokeStyle = TARGET_COLOUR;
        ctx.beginPath();
        ctx.moveTo(ex - 6, ey);
        ctx.lineTo(ex + 6, ey);
        ctx.moveTo(ex, ey - 6);
        ctx.lineTo(ex, ey + 6);
        ctx.stroke();
        if (projected[o + 2] === 1) {
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(toX(projected[o]), toY(projected[o + 1]));
          ctx.stroke();
        }
      }
      if (projected[o + 2] === 0) continue;
      const x = toX(projected[o]);
      const y = toY(projected[o + 1]);
      ctx.fillStyle = MARKER_COLOUR;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(String(i), x + 6, y - 6);
    }

    const s = observer.sample;
    const dbgInside = (lastReply?.dbg as { inside?: boolean } | undefined)?.inside === true;
    const lines = [
      `rest     ${observer.phase}  ${observer.heldSeconds.toFixed(2)}s  ${observer.still ? 'still' : 'moving'}`,
      `speed    ${fmt(s.linearSpeed)} u/s  ${fmt(s.angularSpeedDegrees)} °/s`,
      error.scored > 0
        ? `screen   mean ${fmt(error.meanPx)}px  max ${fmt(error.maxPx)}px  (${error.scored})`
        : 'screen   no expectedNdc — capture() to record',
      `token    ${viewClient.token === null ? 'none' : 'held'}`,
      ...verdictLines(),
    ];
    const lineHeight = 14;
    const boxH = lines.length * lineHeight + 10;
    const boxY = rect.height - boxH - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, boxY, 470, boxH);
    ctx.fillStyle = dbgInside ? INSIDE_COLOUR : '#ffffff';
    lines.forEach((line, i) => ctx.fillText(line, 16, boxY + 16 + i * lineHeight));
  }

  // ── Console seam ──
  const seam: AlignSeam = {
    pick(ndcX = 0, ndcY = 0) {
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(root, true)[0];
      if (!hit) {
        console.info('[align] pick: nothing under that point');
        return null;
      }
      const p: [number, number, number] = [round(hit.point.x, 2), round(hit.point.y, 2), round(hit.point.z, 2)];
      console.info(`[align] ${hit.object.name || '(unnamed)'}\n    { position: [${p.join(', ')}] },`);
      return p;
    },
    capture() {
      projectMarkers(camera, markers, projected);
      camera.getWorldDirection(forward);
      const stage = {
        position: [round(camera.position.x, 2), round(camera.position.y, 2), round(camera.position.z, 2)],
        forward: [round(forward.x, 5), round(forward.y, 5), round(forward.z, 5)],
        fov: round(camera.fov, 3),
        tolerance: CAPTURE_TOLERANCE,
      };
      const captured = markers.map((m, i) => {
        const o = i * PROJECTION_STRIDE;
        return {
          position: [...m.position],
          ...(projected[o + 2] === 1 && {
            expectedNdc: [round(projected[o], 4), round(projected[o + 1], 4)],
          }),
        };
      });
      const rig = options.describeRig();
      console.info(
        '[align] capture\n' +
          '── one stage of VIEW_SOLUTION (a JSON array of stages, in order) ──\n' +
          JSON.stringify(stage) +
          '\n── AUTHORING_MARKERS in observerAuthoring.ts ──\n' +
          captured.map((m) => `  ${literal(m)},`).join('\n') +
          `\n── rig, to reproduce the framing ──\n${literal(rig)}`,
      );
      return { stage, markers: captured, rig };
    },
    scatter(count = 6) {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      for (let attempt = 0; attempt < SCATTER_ROUNDS; attempt++) {
        const targets = scatterTargets({
          count,
          aspect,
          extent: SCATTER_EXTENT,
          minAspect: SCATTER_MIN_ASPECT,
          minSeparation: SCATTER_MIN_SEPARATION,
          random: cryptoRandom,
        });
        if (targets === null) break;

        const anchors: Array<{ point: THREE.Vector3; distance: number }> = [];
        for (const [x, y] of targets) {
          ndc.set(x, y);
          raycaster.setFromCamera(ndc, camera);
          const hit = raycaster.intersectObject(root, true)[0];
          if (!hit || hit.point.y < MIN_ANCHOR_HEIGHT) break;
          anchors.push({ point: hit.point.clone(), distance: hit.distance });
        }
        if (anchors.length !== count) continue;
        const depths = anchors.map((a) => a.distance);
        if (Math.max(...depths) / Math.min(...depths) < MIN_DEPTH_RATIO) continue;

        setMarkers(
          anchors.map(({ point }) => ({
            position: [round(point.x, 2), round(point.y, 2), round(point.z, 2)] as const,
          })),
        );
        return seam.capture();
      }
      console.info('[align] scatter: nothing here met the constraints — move the camera and try again');
      return null;
    },
    status() {
      return {
        phase: observer.phase,
        heldSeconds: observer.heldSeconds,
        still: observer.still,
        linearSpeed: observer.sample.linearSpeed,
        angularSpeedDegrees: observer.sample.angularSpeedDegrees,
        composition: { ...error },
        token: viewClient.token !== null,
        reply: lastReply?.dbg ?? null,
      };
    },
    async claim(email) {
      const token = viewClient.token;
      const code = token === null ? null : await claimWithToken(token, email);
      console.info(`[align] claim: ${code ?? 'no code'}`);
      return code;
    },
    reset() {
      observer.reset();
    },
  };
  const seams = window as unknown as Record<string, unknown>;
  seams.__vertigoAlign = seam;

  return {
    update,
    setReply(reply) {
      lastReply = reply;
    },
    dispose() {
      delete seams.__vertigoAlign;
      overlay.remove();
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}

function round(v: number, digits: number): number {
  return Number(v.toFixed(digits));
}

function fmt(v: number | undefined): string {
  return v !== undefined && Number.isFinite(v) ? v.toFixed(2) : '—';
}

/** A JS object literal with unquoted keys, the shape the authoring file uses. */
function literal(value: unknown): string {
  return JSON.stringify(value).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ');
}
