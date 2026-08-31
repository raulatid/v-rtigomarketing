import * as THREE from 'three';
import {
  BACK_RECT,
  CONTROL_RECTS,
  DETAIL_VIEWPORT_RECT,
  type DisplayControl,
  type DisplayRect,
  controlLabel,
} from './displayConfig';
import { createDisplayShell, type DisplayShellDimensions } from './displayShell';
import { ACTIVATION_DURATION, type DisplayContent } from '../districtConfig';
import beamFragmentShader from '../shaders/beam/fragment.glsl';
import beamVertexShader from '../shaders/beam/vertex.glsl';
import displayFragmentShader from '../shaders/display/fragment.glsl';
import displayVertexShader from '../shaders/display/vertex.glsl';

/**
 * The district's display: a thin volumetric panel above the plaza, the beams
 * that appear to generate it, and the district's only controls.
 *
 * It has two modes on one surface (plan 003 §11), never a second floating panel:
 *
 *   summary   counter, title, short copy, previous / next / saber más / volver
 *   detail    title, long copy in a scrollable viewport, volver
 *
 * Readability is the first constraint. The front face is dense and calm because
 * copy sits on it; the holographic treatment lives on the body's rim, and the
 * controls are drawn as soft fields rather than as buttons with outlines.
 *
 * ## It has a body
 *
 * A zero-thickness plane, at the district's camera angle — 34 degrees off the
 * panel's normal, never head-on — reads as a card rather than as an object.
 * `displayShell` adds a thin plate behind the face, as a CHILD of the panel so
 * position, yaw and tilt all follow for free.
 *
 * ## Browser-only
 *
 * Two 2D canvases are created here. Nothing touches the DOM at module scope, so
 * importing this file is safe anywhere; calling the factory is not. Murcia is
 * only ever constructed client-side, which is what makes that fine.
 */

/**
 * How far the plate overshoots the readable core on every side, in world units.
 *
 * NOT decoration, and it has a hard lower bound: the panel's alpha ramps to zero
 * over `uEdgeFalloff` measured OUTWARD from the core's edge, so if the plate
 * stopped at the core the face's soft fringe would hang outside the plate's hard
 * silhouette and the object would read with two edges a fraction apart. This
 * must stay greater than `uEdgeFalloff * PANEL_HEIGHT` — 0.5 world units at the
 * current values — so the fringe dies on top of the plate, dark on dark, and the
 * only edge anyone can see is the geometric one.
 */
const SHELL_BLEED = 0.9;

/**
 * Plate thickness in world units.
 *
 * About 2.8% of the plate's short side. At the district camera one world unit is
 * roughly 10.6 screen pixels, and the rim is seen at 34 degrees off the face's
 * normal, so this projects to about 4 pixels of visible edge. Below ~0.3 the rim
 * starts to alias at that distance; much above 1 and a thin premium plate turns
 * into masonry.
 */
const SHELL_THICKNESS = 0.6;

/**
 * The panel plane, and the readable core as a fraction of it.
 *
 * SQUARE, and the ratio is not free: the shader maps the text viewport onto the
 * core, so `PANEL_WIDTH / PANEL_HEIGHT` must equal the viewport's ratio or every
 * glyph is stretched by the difference. The two move together.
 *
 * The core's physical size is `plane × inset`, so raising the inset without
 * shrinking the plane makes the display BIGGER. The inset is only 16% margin
 * because the silhouette is carried by the plate's geometry; it has to hold an
 * antialiased edge and a narrow bloom, nothing more.
 */
const PANEL_WIDTH = 48;
const PANEL_HEIGHT = 48;
const CORE_INSET = 0.84;

/**
 * Height of the panel's centre above the plaza, in world units.
 *
 * The lab carried two numbers for this — 24 on a debug slider and 28 as the
 * runtime default — and 28 is the one that was judged. One number now.
 */
const PANEL_ELEVATION = 28;

/**
 * Face and plate share this. In `PANEL_HEIGHT` units, as the SDF works in, which
 * means its WORLD size scales with the panel. `uEdgeFalloff` and `uHaloWidth`
 * below are in the same units.
 */
const CORNER_RADIUS = 0.021;

/** Radius of each projector cone where it leaves the foco, in world units. */
const BEAM_RADIUS = 3.2;

/**
 * One screenful of copy. SQUARE, matching the square core — see `PANEL_WIDTH`.
 */
const TEXT_VIEWPORT_WIDTH = 1600;
const TEXT_VIEWPORT_HEIGHT = 1600;

/**
 * What type SIZES are a fraction of — deliberately NOT the viewport.
 *
 * Positions have to stay fractions of the viewport, because they register
 * against the control rects and the scrollbar track, which are authored in
 * core-UV. Type size has no such obligation, and tying the two together means
 * every retune of the type drags the text column away from the controls.
 */
const TYPE_UNIT = 1040;

/**
 * The canvas is taller than the viewport so detail copy has somewhere to live.
 * The shader windows a viewport-sized slice, which is what makes scrolling a
 * uniform change rather than a repaint and a texture upload (plan 003 §12).
 */
const TEXT_CANVAS_HEIGHT = 3200;

/**
 * Rows of the control-label atlas, in the order the shader indexes them.
 *
 * There is no `close` row: the top-left button reads VOLVER in both modes and
 * only its MEANING changes, so there is no second word to draw.
 */
const LABEL_ROWS = ['previous', 'next', 'detail', 'back'] as const;

/**
 * Which controls occupy which shader slot, per mode.
 *
 * One ordered list per mode is the single source for three things that must
 * agree: the rects uniform, the label-row uniform, and `indexOfControl`'s
 * hover/press mapping. Written out separately they drift, and the symptom is a
 * hover lighting the wrong button.
 */
const SUMMARY_SLOTS = ['previous', 'next', 'detail', 'back'] as const;
const DETAIL_SLOTS = ['back'] as const;
const LABEL_WIDTH = 512;
const LABEL_ROW_HEIGHT = 128;

/** Seconds for a content swap to fade out and back in. */
const CONTENT_FADE = 0.22;

/**
 * How the panel tracks the camera. Y only — a full billboard is what plan 002
 * explicitly refuses, because the panel's lean is part of the object.
 */
const FOLLOW = {
  /** Degrees either side of the resting yaw the panel may turn. */
  maxYawOffset: 42,
  /** Seconds. An exponential time constant, not a per-frame lerp factor. */
  damping: 0.9,
  /** Degrees of error below which the panel does not move at all. */
  deadZone: 1.5,
  /** Degrees per second, so a fast orbit cannot whip the panel around. */
  speedCap: 28,
};

export interface ServicesDisplayOptions {
  /** Plaza centre, world space. The panel hangs above it. */
  centre: THREE.Vector3;
  groundY: number;
  /** The foco nodes the beams leave from. Any number, including none. */
  focos: readonly THREE.Object3D[];
  locale: string;
  /**
   * The yaw the panel rests at and turns around, in degrees.
   *
   * Should match the district's approach yaw, so the panel faces the visitor as
   * they arrive and returns to the same pose every visit. The follow clamp is
   * measured from here, which is what makes it impossible for the panel to end
   * up facing away.
   */
  baseYawDegrees: number;
}

export interface ServicesDisplay {
  readonly object: THREE.Object3D;
  /** The panel mesh — what the interaction raycasts, and the only hit surface. */
  readonly panel: THREE.Mesh;
  /** The interaction reads `uCoreInset` off this to map a UV to core space. */
  readonly panelMaterial: THREE.ShaderMaterial;
  setContent(content: DisplayContent | null): void;
  setDetailOpen(open: boolean): void;
  /** Delta as a fraction of the scrollable range. Clamped here. */
  scrollDetail(delta: number): void;
  setHover(control: DisplayControl | null): void;
  setPressed(control: DisplayControl | null): void;
  /** Takes the frame delta and the camera the panel should turn toward. */
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

export function createServicesDisplay(options: ServicesDisplayOptions): ServicesDisplay {
  const { centre, groundY, focos, locale } = options;

  // Outer group owns POSITION and YAW; the panel inside owns the fixed tilt.
  // Splitting them keeps 45 degrees at 45 degrees while the yaw animates.
  const root = new THREE.Group();
  root.position.set(centre.x, groundY + PANEL_ELEVATION, centre.z);

  // --- copy texture ----------------------------------------------------------

  const canvas = document.createElement('canvas');
  canvas.width = TEXT_VIEWPORT_WIDTH;
  canvas.height = TEXT_CANVAS_HEIGHT;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // --- control labels --------------------------------------------------------

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = LABEL_WIDTH;
  labelCanvas.height = LABEL_ROW_HEIGHT * LABEL_ROWS.length;

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.NoColorSpace;
  labelTexture.anisotropy = 4;
  labelTexture.wrapS = THREE.ClampToEdgeWrapping;
  labelTexture.wrapT = THREE.ClampToEdgeWrapping;

  const paintLabels = (): void => {
    const ctx = labelCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    LABEL_ROWS.forEach((row, index) => {
      const centreY = index * LABEL_ROW_HEIGHT + LABEL_ROW_HEIGHT / 2;

      // Drawn PRE-DISTORTED, by exactly the inverse of the stretch it is about
      // to receive.
      //
      // The shader maps a row across the whole of its rect with no aspect
      // correction, so a 4:1 row landing in a rect of some other aspect is
      // squashed by the difference. Survivable while every control was a wide
      // pill, but the arrows sit in 0.495:1 bands and would be crushed
      // EIGHT-FOLD, which reads as thin vertical slivers rather than chevrons.
      //
      // Correcting here rather than in the shader adds no uniforms and leaves
      // the layout free to give the arrows square-ish rects for the sake of the
      // thumb rather than the sake of the atlas.
      const rect = CONTROL_RECTS[row];
      const rectAspect = (rect.width * PANEL_WIDTH) / (rect.height * PANEL_HEIGHT);
      const rowAspect = LABEL_WIDTH / LABEL_ROW_HEIGHT;

      ctx.save();
      ctx.translate(LABEL_WIDTH / 2, centreY);
      ctx.scale(rowAspect / rectAspect, 1);

      if (row === 'previous' || row === 'next') {
        // Arrows as glyphs rather than shader triangles: one mechanism for every
        // control instead of two, and they inherit the same type treatment.
        ctx.font = `300 ${Math.round(LABEL_ROW_HEIGHT * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(row === 'previous' ? '‹' : '›', 0, 0);
      } else {
        ctx.font = `600 ${Math.round(LABEL_ROW_HEIGHT * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
        // Uppercased here rather than in the config, so the copy stays the word a
        // translator would write and the styling stays a rendering decision.
        ctx.fillText(controlLabel(locale, row).toUpperCase(), 0, 0);
      }

      ctx.restore();
    });

    labelTexture.needsUpdate = true;
  };

  paintLabels();

  /**
   * Rects reach the shader bottom-up; the config authors them top-down, the way
   * the copy is laid out. Converted in exactly one place.
   */
  const toGl = (rect: DisplayRect): THREE.Vector4 =>
    new THREE.Vector4(rect.x, 1 - (rect.y + rect.height), rect.width, rect.height);

  const rowOf = (name: (typeof LABEL_ROWS)[number]): number => LABEL_ROWS.indexOf(name);

  /**
   * Both uniforms are sized 4 in the shader, so both modes are padded to 4.
   *
   * The loop stops at `uControlCount`, so the tail is never read — but three
   * caches uniform values by reference, and handing it a 1-element array where
   * it held a 4-element one is the kind of shape change that behaves differently
   * across drivers for no benefit. Padding costs nothing.
   */
  const padded = <T>(values: readonly T[], fill: T): T[] => [
    ...values,
    ...Array<T>(Math.max(0, 4 - values.length)).fill(fill),
  ];

  const summaryRects = SUMMARY_SLOTS.map((name) => toGl(CONTROL_RECTS[name]));
  const summaryRows = SUMMARY_SLOTS.map(rowOf);
  const detailRects = padded(
    DETAIL_SLOTS.map((name) => toGl(CONTROL_RECTS[name])),
    toGl(BACK_RECT),
  );
  const detailRows = padded(DETAIL_SLOTS.map(rowOf), rowOf('back'));

  const panelMaterial = new THREE.ShaderMaterial({
    vertexShader: displayVertexShader,
    fragmentShader: displayFragmentShader,
    transparent: true,
    // Scene-level, and free while Murcia's fog is null. Same opt-in as rio.
    fog: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uActivation: { value: 0 },
      uTextOpacity: { value: 1 },
      uAspect: { value: PANEL_WIDTH / PANEL_HEIGHT },
      uCoreInset: { value: CORE_INSET },
      uCornerRadius: { value: CORNER_RADIUS },
      // An antialiasing width, not a dissolve. The plate behind carries the
      // silhouette, so the face's job at its edge is to stop cleanly.
      //
      // In `PANEL_HEIGHT` units: 0.0104 × 48 = 0.50 world units of fringe, which
      // stays under `SHELL_BLEED` (0.9). Raising it past that puts the fringe
      // outside the plate's silhouette — the doubled edge that constant exists
      // to prevent.
      uEdgeFalloff: { value: 0.0104 },
      // Full. With a solid plate behind it the copy's backing is deterministic
      // rather than whatever happens to be behind the display.
      uCoreOpacity: { value: 1 },
      // A narrow bloom hugging a real edge. Both it and the falloff must fit the
      // margin outside the core, which is `0.5 - 0.5 * inset` = 0.08 shader
      // units; 0.0104 + 0.026 leaves headroom.
      uHaloWidth: { value: 0.026 },
      uHaloStrength: { value: 0.06 },
      // STAYS ZERO, permanently. A rim on the face would draw a second edge a
      // fraction in front of the plate's, and the object would read as doubled.
      // The rim treatment this display wants lives on the plate, where it is
      // real geometry catching a real grazing term at any camera angle.
      uRimStrength: { value: 0 },
      uNoiseStrength: { value: 0.1 },
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Color().setHex(0x070d18, THREE.SRGBColorSpace) },
      uHaloColor: { value: new THREE.Color().setHex(0x123b52, THREE.SRGBColorSpace) },
      uTextColor: { value: new THREE.Color().setHex(0xc8d4dc, THREE.SRGBColorSpace) },
      uText: { value: texture },
      // Copy windowing.
      uTextWindow: { value: TEXT_VIEWPORT_HEIGHT / TEXT_CANVAS_HEIGHT },
      uTextOffset: { value: 0 },
      // Controls.
      uControlLabels: { value: labelTexture },
      uRects: { value: summaryRects },
      uRectRows: { value: summaryRows },
      uControlCount: { value: SUMMARY_SLOTS.length },
      // Fed from `LABEL_ROWS.length` rather than hardcoded in the shader, which
      // is where it used to live as a second copy of the same number.
      uLabelRows: { value: LABEL_ROWS.length },
      uDetailOpen: { value: 0 },
      uHoverIndex: { value: -1 },
      uPressedIndex: { value: -1 },
      uControlStrength: { value: 0.42 },
      // Scrollbar: thumb size 0 hides it entirely.
      uScrollThumb: { value: 0 },
      uScrollAmount: { value: 0 },
      uScrollRect: { value: toGl(DETAIL_VIEWPORT_RECT) },
    },
  });

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT), panelMaterial);
  panel.rotation.x = -Math.PI / 4;
  panel.renderOrder = 3;
  // Raycastable: the display is the district's interaction surface, and the
  // controls are found by reading `intersection.uv` against the same rects the
  // shader draws from.
  root.add(panel);

  /**
   * The plate's world dimensions, derived in exactly one place.
   *
   * `CORNER_RADIUS` is multiplied by `PANEL_HEIGHT` because the face's SDF works
   * in p-space, where 1.0 is the plane's height — the plate needs the same
   * corner in world units or the two silhouettes will not register.
   */
  const shellDimensions: DisplayShellDimensions = {
    width: PANEL_WIDTH * CORE_INSET + SHELL_BLEED * 2,
    height: PANEL_HEIGHT * CORE_INSET + SHELL_BLEED * 2,
    thickness: SHELL_THICKNESS,
    radius: CORNER_RADIUS * PANEL_HEIGHT + SHELL_BLEED,
  };

  const shell = createDisplayShell(shellDimensions);
  // A CHILD of the panel, doing real work in two directions. It inherits
  // position, yaw and the fixed tilt; and the interaction raycasts with
  // `intersectObject(panel, false)` — NON-recursive — so the plate is provably
  // never hit. That `false` is load-bearing: flipping it to `true` would return
  // rim-wall intersections whose `uv` is meaningless, and the controls would fire
  // at wrong positions rather than fail loudly.
  panel.add(shell.object);

  // --- beams -----------------------------------------------------------------

  const beamMaterial = new THREE.ShaderMaterial({
    vertexShader: beamVertexShader,
    fragmentShader: beamFragmentShader,
    transparent: true,
    fog: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uActivation: { value: 0 },
      uIntensity: { value: 1.1 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color().setHex(0x64d8f4, THREE.SRGBColorSpace) },
    },
  });

  // Beams live OUTSIDE the yawing group: they join two fixed points in the
  // world, and would swing away from their projectors if they inherited the
  // panel's rotation.
  const beams = new THREE.Group();
  const beamGeometry = new THREE.CylinderGeometry(1, 0.18, 1, 18, 1, true);
  const beamMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < focos.length; i += 1) {
    const mesh = new THREE.Mesh(beamGeometry, beamMaterial);
    mesh.renderOrder = 2;
    mesh.raycast = () => {};
    beams.add(mesh);
    beamMeshes.push(mesh);
  }

  /**
   * Where the beams converge: the visible field's lower edge.
   *
   * `cos(tilt)` is not optional. Half the core's height is a distance along the
   * PANEL, and the panel leans back 45 degrees, so only its cosine is vertical.
   * Without it the target sits low by `halfCore * (1 - cos 45)` — about 6 units
   * here, which would put the convergence visibly below the plate.
   */
  const layoutBeams = (): void => {
    const halfCore = PANEL_HEIGHT * CORE_INSET * 0.5;
    const target = new THREE.Vector3(
      centre.x,
      groundY + PANEL_ELEVATION - halfCore * Math.cos(panel.rotation.x),
      centre.z,
    );

    const from = new THREE.Vector3();
    const box = new THREE.Box3();
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();

    focos.forEach((foco, i) => {
      const mesh = beamMeshes[i];
      if (!mesh) return;

      box.setFromObject(foco);
      from.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);

      direction.subVectors(target, from);
      const length = direction.length() || 1;

      mesh.position.copy(from).addScaledVector(direction, 0.5);
      mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
      mesh.scale.set(BEAM_RADIUS, length, BEAM_RADIUS);
    });
  };

  layoutBeams();

  const container = new THREE.Group();
  container.add(root, beams);

  // --- copy layout -----------------------------------------------------------

  /** Height of the copy actually drawn, in canvas pixels. Drives the scrollbar. */
  let contentHeight = TEXT_VIEWPORT_HEIGHT;

  const paint = (content: DisplayContent, detail: boolean): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // POSITIONS come from the viewport, because they have to register against
    // the control rects and the scrollbar track, which are authored in core-UV.
    // SIZES come from `TYPE_UNIT`, which is free to be retuned without moving
    // anything.
    const view = TEXT_VIEWPORT_HEIGHT;
    const type = TYPE_UNIT;
    const padX = canvas.width * 0.11;
    const maxWidth = canvas.width - padX * 2;

    if (!detail) {
      // Sits between VOLVER (which ends at core 0.12) and the footer bar (which
      // starts at 0.845), rather than tucked under the header. The summary is
      // four short blocks in a square, so top-aligning it leaves a third of the
      // panel visibly empty underneath. Detail copy is NOT moved with it,
      // because long copy should start high and scroll rather than begin half
      // way down.
      let y = view * 0.32;

      ctx.font = `600 ${Math.round(type * 0.042)}px ui-sans-serif, system-ui, sans-serif`;
      drawTracked(ctx, content.eyebrow.toUpperCase(), padX, y, type * 0.014);
      y += type * 0.1;

      ctx.font = `700 ${Math.round(type * 0.1)}px ui-sans-serif, system-ui, sans-serif`;
      y = wrapText(ctx, content.title, padX, y, maxWidth, type * 0.112);
      y += type * 0.055;

      ctx.font = `400 ${Math.round(type * 0.05)}px ui-sans-serif, system-ui, sans-serif`;
      y = wrapText(ctx, content.summary, padX, y, maxWidth, type * 0.072);

      // The summary never scrolls: it is sized to fit and the copy is
      // constrained to suit, rather than the layout bending around it (plan 003
      // §10). The footer bar starts at core 0.845, so there is room for about
      // six body lines before the copy would reach the controls.
      warnIfOverflowing(y, view * 0.845, 'summary');
      contentHeight = TEXT_VIEWPORT_HEIGHT;
    } else {
      // Below the reading viewport's TOP fold at core 0.17, so the title is not
      // faded out by it.
      let y = view * 0.19;

      ctx.font = `700 ${Math.round(type * 0.082)}px ui-sans-serif, system-ui, sans-serif`;
      y = wrapText(ctx, content.title, padX, y, maxWidth, type * 0.094);
      y += type * 0.045;

      ctx.font = `400 ${Math.round(type * 0.046)}px ui-sans-serif, system-ui, sans-serif`;
      y = wrapText(ctx, content.detail, padX, y, maxWidth, type * 0.068);

      // A tail of padding, so the last line does not sit against the fold.
      warnIfOverflowing(y, TEXT_CANVAS_HEIGHT, 'detail');
      contentHeight = Math.min(TEXT_CANVAS_HEIGHT, y + type * 0.22);
    }

    texture.needsUpdate = true;
  };

  // --- state -----------------------------------------------------------------

  let activationTarget = 0;
  let elapsed = 0;
  let currentContent: DisplayContent | null = null;
  let pendingContent: DisplayContent | null = null;
  let fade: 'idle' | 'out' | 'in' = 'idle';
  let fadeProgress = 0;
  let detailOpen = false;
  let scroll01 = 0;

  const baseYaw = options.baseYawDegrees;
  let currentYaw = baseYaw;
  root.rotation.y = THREE.MathUtils.degToRad(currentYaw);

  /** Scroll range as a fraction of the canvas, 0 when the copy fits. */
  const maxOffset = (): number =>
    Math.max(0, (contentHeight - TEXT_VIEWPORT_HEIGHT) / TEXT_CANVAS_HEIGHT);

  const applyScroll = (): void => {
    const range = maxOffset();
    panelMaterial.uniforms['uTextOffset'].value = scroll01 * range;
    // A thumb only exists when there is somewhere to go.
    panelMaterial.uniforms['uScrollThumb'].value =
      range > 0 && detailOpen ? Math.max(0.12, TEXT_VIEWPORT_HEIGHT / contentHeight) : 0;
    panelMaterial.uniforms['uScrollAmount'].value = scroll01;
  };

  const applyMode = (): void => {
    panelMaterial.uniforms['uRects'].value = detailOpen ? detailRects : summaryRects;
    panelMaterial.uniforms['uRectRows'].value = detailOpen ? detailRows : summaryRows;
    // ONE control while reading. Pagination used to stay on screen at a fraction
    // of its strength, on the reasoning that a control which vanishes is harder
    // to relearn than one that visibly stands down. That held while the arrows
    // kept their position; now the whole footer empties and VOLVER changes
    // meaning, so a ghost row would only blur which control is live.
    panelMaterial.uniforms['uControlCount'].value = detailOpen
      ? DETAIL_SLOTS.length
      : SUMMARY_SLOTS.length;
    panelMaterial.uniforms['uDetailOpen'].value = detailOpen ? 1 : 0;

    // Cleared on every mode change, and this is not housekeeping.
    //
    // Slot 0 is `previous` in the summary and `close` in the detail, so a hover
    // index that outlives the switch lights the wrong button. The two modes are
    // driven by separate flags — the interaction reads the store's `detailOpen`,
    // this file has its own — with no ordering guarantee between them, and on
    // touch there is no `pointermove` afterwards to correct it.
    panelMaterial.uniforms['uHoverIndex'].value = -1;
    panelMaterial.uniforms['uPressedIndex'].value = -1;

    applyScroll();
  };

  /** Which shader slot a control occupies, for hover and press. Mode-dependent. */
  const indexOfControl = (control: DisplayControl | null): number => {
    if (!control) return -1;
    // `close` is the detail mode's name for the same button `back` names in the
    // summary; the atlas and the slot list know it only as `back`.
    const name = control === 'close' ? 'back' : control;
    const slots: readonly string[] = detailOpen ? DETAIL_SLOTS : SUMMARY_SLOTS;
    return slots.indexOf(name);
  };

  const sameContent = (a: DisplayContent | null, b: DisplayContent | null): boolean =>
    a?.title === b?.title && a?.summary === b?.summary && a?.eyebrow === b?.eyebrow;

  applyMode();

  return {
    object: container,
    panel,
    panelMaterial,

    setContent(content) {
      if (sameContent(content, currentContent) && activationTarget === (content ? 1 : 0)) return;

      pendingContent = content;

      if (content === null) {
        activationTarget = 0;
        fade = 'idle';
        return;
      }

      activationTarget = 1;

      if (currentContent === null) {
        currentContent = content;
        scroll01 = 0;
        paint(content, detailOpen);
        applyScroll();
        fade = 'idle';
        panelMaterial.uniforms['uTextOpacity'].value = 1;
        return;
      }

      fade = 'out';
      fadeProgress = 0;
    },

    setDetailOpen(open) {
      if (open === detailOpen) return;
      detailOpen = open;
      // Every mode change starts at the top (plan 003 §22).
      scroll01 = 0;
      applyMode();
      if (currentContent) {
        pendingContent = currentContent;
        fade = 'out';
        fadeProgress = 0;
      }
    },

    scrollDetail(delta) {
      if (!detailOpen || maxOffset() <= 0) return;
      scroll01 = THREE.MathUtils.clamp(scroll01 + delta, 0, 1);
      applyScroll();
    },

    setHover(control) {
      panelMaterial.uniforms['uHoverIndex'].value = indexOfControl(control);
    },

    setPressed(control) {
      panelMaterial.uniforms['uPressedIndex'].value = indexOfControl(control);
    },

    update(dt, camera) {
      elapsed += dt;
      panelMaterial.uniforms['uTime'].value = elapsed;
      beamMaterial.uniforms['uTime'].value = elapsed;

      const activation = panelMaterial.uniforms['uActivation'].value as number;
      if (activation !== activationTarget) {
        const step = dt / ACTIVATION_DURATION;
        const next =
          activationTarget > activation
            ? Math.min(activationTarget, activation + step)
            : Math.max(activationTarget, activation - step);
        panelMaterial.uniforms['uActivation'].value = next;
        beamMaterial.uniforms['uActivation'].value = next;
        // The plate fades with the face rather than popping in behind it — the
        // only reason its material is `transparent` at all.
        shell.setActivation(next);
        if (next === 0) currentContent = null;
      }

      // Content swap: out, repaint, in.
      if (fade !== 'idle') {
        fadeProgress = Math.min(1, fadeProgress + dt / CONTENT_FADE);
        if (fade === 'out' && fadeProgress >= 1) {
          if (pendingContent) {
            currentContent = pendingContent;
            paint(pendingContent, detailOpen);
            applyScroll();
          }
          fade = 'in';
          fadeProgress = 0;
        } else if (fade === 'in' && fadeProgress >= 1) {
          fade = 'idle';
        }
        const textOpacity = fade === 'out' ? 1 - fadeProgress : fade === 'in' ? fadeProgress : 1;
        panelMaterial.uniforms['uTextOpacity'].value = textOpacity;
      }

      // --- Y-only orientation -------------------------------------------------

      const toCamera = new THREE.Vector3();
      camera.getWorldPosition(toCamera).sub(root.position);
      // Yaw only: the panel's tilt is fixed and the camera's height must not
      // affect it. A full billboard is what plan 002 explicitly refuses.
      const desired = THREE.MathUtils.radToDeg(Math.atan2(toCamera.x, toCamera.z));

      // Clamped around a FIXED resting yaw, so the panel returns to the same
      // pose every visit and can never end up facing away.
      const clamped = THREE.MathUtils.clamp(
        shortestDelta(baseYaw, desired) + baseYaw,
        baseYaw - FOLLOW.maxYawOffset,
        baseYaw + FOLLOW.maxYawOffset,
      );

      const error = clamped - currentYaw;
      if (Math.abs(error) > FOLLOW.deadZone) {
        // Frame-rate independent smoothing. A fixed lerp factor would turn the
        // panel faster on a faster machine, which is the kind of motion
        // difference that is impossible to tune.
        const smoothing = 1 - Math.exp(-dt / Math.max(FOLLOW.damping, 0.001));
        const stepDegrees = THREE.MathUtils.clamp(
          error * smoothing,
          -FOLLOW.speedCap * dt,
          FOLLOW.speedCap * dt,
        );
        currentYaw += stepDegrees;
        root.rotation.y = THREE.MathUtils.degToRad(currentYaw);
      }
    },

    dispose() {
      // Canvas textures are NOT released by `material.dispose()`, and the beams
      // share one geometry only this module knows about.
      texture.dispose();
      labelTexture.dispose();
      panel.geometry.dispose();
      panelMaterial.dispose();
      // Geometry AND material: the plate is built here, not read off the export,
      // so unlike `districtFlow` this module owns both halves of it.
      shell.dispose();
      beamGeometry.dispose();
      beamMaterial.dispose();
    },
  };
}

/**
 * Says so when copy runs past the room it has.
 *
 * Both overflows are otherwise SILENT: `contentHeight` is clamped by `Math.min`,
 * and `wrapText` happily keeps drawing past the bottom of the canvas into
 * nothing. Copy that is too long simply disappears, with no error and no visual
 * cue that anything was lost — the worst way for a content limit to be found.
 */
function warnIfOverflowing(bottom: number, limit: number, mode: string): void {
  if (bottom <= limit) return;
  console.warn(
    `[district] ${mode} copy runs ${Math.round(bottom - limit)}px past its` +
      ` room (${Math.round(bottom)} of ${Math.round(limit)}) and will be cut off.`,
  );
}

/** Shortest signed angular difference, in degrees. */
function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
}

/** Word-wraps, returning the y the next block should start at. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let cursorY = y;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }

  return cursorY;
}
