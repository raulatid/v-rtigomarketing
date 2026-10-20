import { murciaConfig } from '../config/murciaConfig';
import type { EnvironmentConfig } from '../config/environmentConfig';
import { deviceResolution } from './lightmaps/deviceResolution';
import { atlasResolutions, parseUnifiedManifest } from './lightmaps/unifiedManifest';

// The city's files, read ahead of its build (ADR 016, the work rule).
//
// Downloading is network work, which the opening admits from `shrink`; parsing,
// Draco and Basis decoding, assembly and uploads wait for `site`. So the bytes
// are read into memory first, and the loaders take them from here. Read in
// full rather than left as an open response: a body nobody reads stops
// downloading once the browser's buffer fills.
//
// Keyed by URL, and each file is taken once. A loader asking for a file that
// was not read ahead (a debug override of the model, or a viewport that crossed
// the lightmaps' breakpoint in between) fetches it itself, as it always did.

export interface CityBytes {
  buffer(url: string): Promise<ArrayBuffer>;
  json(url: string): Promise<unknown>;
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await (init ? fetch(url, init) : fetch(url));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** No reading ahead: every file is fetched when it is asked for. */
export const fetchCityBytes: CityBytes = {
  buffer: async (url) => (await fetchOk(url)).arrayBuffer(),
  json: async (url) => (await fetchOk(url)).json(),
};

// Low, because nothing on screen waits for these while they download, and the
// satellites, which `orbits` does wait for, may still be loading in `shrink`.
const AHEAD: RequestInit = { priority: 'low' };
const readAhead: CityBytes = {
  buffer: async (url) => (await fetchOk(url, AHEAD)).arrayBuffer(),
  json: async (url) => (await fetchOk(url, AHEAD)).json(),
};

/**
 * Starts reading the model, the lightmap manifest and every atlas this device
 * will ask for. Nothing rejects here: a failed read is reported by the loader
 * that takes it, on the path it already has for a failed fetch.
 */
export function prefetchCityBytes(
  env: Pick<EnvironmentConfig, 'modelPath' | 'lightmaps'> = murciaConfig,
): CityBytes {
  const ahead = new Map<string, Promise<unknown>>();
  const read = <T>(url: string, fetchOne: (url: string) => Promise<T>): Promise<T> => {
    const pending = fetchOne(url);
    pending.catch(() => {});
    ahead.set(url, pending);
    return pending;
  };

  read(env.modelPath, readAhead.buffer);
  const lightmaps = env.lightmaps;
  if (lightmaps) {
    // The same choice `loadUnifiedLightmaps` makes. The atlases are added
    // before the loader can see the manifest, because this reaction is
    // registered on its promise first.
    read(lightmaps.baseUrl + lightmaps.manifest, readAhead.json)
      .then((raw) => {
        const manifest = parseUnifiedManifest(raw);
        const sizes = atlasResolutions(manifest, deviceResolution(), lightmaps.desktop1024);
        for (const [key, size] of sizes) {
          read(lightmaps.baseUrl + manifest.atlases[key].variants[size].file, readAhead.buffer);
        }
      })
      .catch(() => {});
  }

  const take = <T>(url: string, fetchOne: (url: string) => Promise<T>): Promise<T> => {
    const pending = ahead.get(url) as Promise<T> | undefined;
    if (!pending) return fetchOne(url);
    ahead.delete(url);
    return pending;
  };
  return {
    buffer: (url) => take(url, fetchCityBytes.buffer),
    json: (url) => take(url, fetchCityBytes.json),
  };
}
