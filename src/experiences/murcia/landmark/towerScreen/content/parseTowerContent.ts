import type { FacadeContent, FacadeRotation, FreeformContent } from './facadeContent';
import { isFiniteNumber, isFilledString, isRecord, parseFilledStrings } from './guards';
import { parseBlocks } from './parseBlocks';

/**
 * A tower content document, validated — or `null`.
 *
 * Written against `unknown` because the document comes from outside the build:
 * today the bundled defaults never pass through here, but the day the
 * compositions come from a CMS query, this is the function that query's result
 * goes through, unchanged.
 *
 * TOTAL, and rejection is per DOCUMENT: a composition missing its blocks, a
 * duplicated id, or a playlist naming a composition that does not exist rejects
 * the whole thing. Showing two of three slides — or a slide that is blank for
 * its whole turn — is how a content mistake ships unnoticed.
 */

export interface TowerContent {
  readonly compositions: readonly FacadeContent[];
  /** Null when the document declares none. */
  readonly rotation: FacadeRotation | null;
}

function parseOne(value: unknown): FreeformContent | null {
  if (!isRecord(value) || value['template'] !== 'freeform') return null;

  const id = value['id'];
  if (!isFilledString(id)) return null;

  // Never drawn, so the one field allowed to be missing: the id reads fine.
  const rawLabel = value['label'];
  if (rawLabel !== undefined && !isFilledString(rawLabel)) return null;
  const label = isFilledString(rawLabel) ? rawLabel : id;

  const blocks = parseBlocks(value['blocks']);
  if (!blocks) return null;

  return { template: 'freeform', id, label, blocks };
}

/** The playlist, checked against the compositions it names. */
function parseRotation(value: unknown, ids: ReadonlySet<string>): FacadeRotation | null {
  if (!isRecord(value)) return null;

  const compositions = parseFilledStrings(value['compositions']);
  const seconds = value['seconds'];
  if (!compositions || compositions.length === 0) return null;
  if (!isFiniteNumber(seconds) || seconds <= 0) return null;
  if (!compositions.every((id) => ids.has(id))) return null;

  const [first, ...rest] = compositions;
  return { compositions: [first!, ...rest], seconds };
}

export function parseTowerContent(raw: unknown): TowerContent | null {
  if (!isRecord(raw)) return null;

  const list = raw['compositions'];
  if (!Array.isArray(list) || list.length === 0) return null;

  const parsed: FreeformContent[] = [];
  const seen = new Set<string>();
  for (const entry of list as readonly unknown[]) {
    const content = parseOne(entry);
    if (!content || seen.has(content.id)) return null;
    seen.add(content.id);
    parsed.push(content);
  }

  const rawRotation = raw['rotation'];
  if (rawRotation === undefined) return { compositions: parsed, rotation: null };
  const rotation = parseRotation(rawRotation, seen);
  return rotation ? { compositions: parsed, rotation } : null;
}
