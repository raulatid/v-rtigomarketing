import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCityBytes, prefetchCityBytes } from './cityBytes';

afterEach(() => { vi.unstubAllGlobals(); });

const MANIFEST = {
  uvChannel: 1, requiredNames: ['torre'], atlases: {
    north: { threeLightMapIntensity: 1, variants: {
      1024: { file: 'north-1024.ktx2', bytes: 1, mipLevels: 1 },
      2048: { file: 'north-2048.ktx2', bytes: 2, mipLevels: 2 },
    } },
    south: { threeLightMapIntensity: 1, variants: {
      1024: { file: 'south-1024.ktx2', bytes: 1, mipLevels: 1 },
      2048: { file: 'south-2048.ktx2', bytes: 2, mipLevels: 2 },
    } },
  },
};

const ENV = {
  modelPath: '/models/city.glb',
  lightmaps: { baseUrl: '/maps/', manifest: 'lightmaps.json', desktop1024: ['south'] },
};

/** A fetch that serves the manifest as JSON and every other file as its own buffer. */
function stubFetch(failing: string[] = []) {
  const buffers = new Map<string, ArrayBuffer>();
  const fetch = vi.fn(async (url: string) => {
    if (failing.includes(url)) return { ok: false, status: 404 };
    if (url.endsWith('.json')) return { ok: true, json: async () => MANIFEST };
    const buffer = buffers.get(url) ?? new ArrayBuffer(4);
    buffers.set(url, buffer);
    return { ok: true, arrayBuffer: async () => buffer };
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, buffers };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('prefetchCityBytes', () => {
  it('reads the model, the manifest and the atlases this device will ask for, at low priority', async () => {
    const { fetch } = stubFetch();
    prefetchCityBytes(ENV);
    await settle();

    // No window here, so the device resolution is 2048; `south` is reduced to 1024.
    expect(fetch.mock.calls).toEqual([
      ['/models/city.glb', { priority: 'low' }],
      ['/maps/lightmaps.json', { priority: 'low' }],
      ['/maps/north-2048.ktx2', { priority: 'low' }],
      ['/maps/south-1024.ktx2', { priority: 'low' }],
    ]);
  });

  it('hands each file read ahead to the loader without fetching it again', async () => {
    const { fetch, buffers } = stubFetch();
    const bytes = prefetchCityBytes(ENV);

    expect(await bytes.json('/maps/lightmaps.json')).toBe(MANIFEST);
    // Taken straight after the manifest, as the loader does: already on its way.
    expect(await bytes.buffer('/maps/north-2048.ktx2')).toBe(buffers.get('/maps/north-2048.ktx2'));
    expect(await bytes.buffer('/models/city.glb')).toBe(buffers.get('/models/city.glb'));
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('fetches a file it did not read ahead, or one already taken, on demand', async () => {
    const { fetch } = stubFetch();
    const bytes = prefetchCityBytes(ENV);
    await bytes.buffer('/models/city.glb');

    await bytes.buffer('/models/override.glb');
    await bytes.buffer('/models/city.glb');
    expect(fetch).toHaveBeenCalledWith('/models/override.glb');
    expect(fetch.mock.calls.filter(([url]) => url === '/models/city.glb')).toEqual([
      ['/models/city.glb', { priority: 'low' }],
      ['/models/city.glb'],
    ]);
  });

  it('reports a failed read to the loader that takes it, and to nobody before', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      stubFetch(['/models/city.glb', '/maps/lightmaps.json']);
      const bytes = prefetchCityBytes(ENV);
      await settle();
      expect(unhandled).not.toHaveBeenCalled();

      await expect(bytes.buffer('/models/city.glb')).rejects.toThrow('/models/city.glb: HTTP 404');
      await expect(bytes.json('/maps/lightmaps.json')).rejects.toThrow('HTTP 404');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('reads only the model when the city has no unified bake', async () => {
    const { fetch } = stubFetch();
    prefetchCityBytes({ modelPath: '/models/city.glb' });
    await settle();
    expect(fetch.mock.calls).toEqual([['/models/city.glb', { priority: 'low' }]]);
  });
});

describe('fetchCityBytes', () => {
  it('fails on an HTTP error rather than handing back an error page', async () => {
    stubFetch(['/models/city.glb']);
    await expect(fetchCityBytes.buffer('/models/city.glb')).rejects.toThrow('HTTP 404');
  });
});
