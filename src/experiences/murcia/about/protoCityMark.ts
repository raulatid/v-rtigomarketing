/**
 * The city stop's 3D isotype (`cityMarkHologram.ts`): its tuning knobs, the
 * sibling of `earth/config/protoHolo.ts`, built the same way. The hologram
 * ships (2026-11-24) as `stand`, each number the pose's own: production never
 * imports this module (`MurciaExperience`, `cityMarkHologram.ts`). In a debug
 * build, `?markPose=` picks where it is drawn:
 * - `stand` (default): in the air, upright over the city and level with it (its
 *   base parallel to the roofs), facing the eye across it, spinning on the world's upright axis;
 * - `flat`: in the air, lying as the ground's mark lies, spinning like a plate;
 * - `ground`: the first prototype, the outline in the air over its place on the
 *   city and the fill falling from it to the ground's mark. Does not spin.
 *
 * Numbers, all optional, as shares of the mark's side: `?markDepth=` (the
 * slab's thickness; for `ground`, the outline's height), `&markLift=` (the air
 * under it), `&markScale=` (the upright mark's size). `&markSpin=` in rad/s.
 *
 * Gated on `DEBUG_TOOLS_ENABLED`, and read once, at module load: in a
 * production build the parser is never consulted.
 */
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags';

export type CityMarkPose = 'stand' | 'flat' | 'ground';

export interface ProtoCityMarkParams {
  readonly pose: CityMarkPose;
  /** Null: the pose's own default. */
  readonly depth: number | null;
  readonly lift: number | null;
  readonly scale: number | null;
  readonly spin: number | null;
}

const DEFAULTS: ProtoCityMarkParams = { pose: 'stand', depth: null, lift: null, scale: null, spin: null };

function number(raw: string | null, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : null;
}

export function parseProtoCityMark(search: string): ProtoCityMarkParams {
  if (!DEBUG_TOOLS_ENABLED) return DEFAULTS;
  const params = new URLSearchParams(search);
  const pose = params.get('markPose');
  return {
    pose: pose === 'flat' || pose === 'ground' ? pose : 'stand',
    depth: number(params.get('markDepth') ?? params.get('markHeight'), 1),
    lift: number(params.get('markLift'), 2),
    scale: number(params.get('markScale'), 2),
    spin: number(params.get('markSpin'), 10),
  };
}

export const PROTO_CITY_MARK: ProtoCityMarkParams =
  typeof window === 'undefined' ? DEFAULTS : parseProtoCityMark(window.location.search);
