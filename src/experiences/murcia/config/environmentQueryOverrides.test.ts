import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { applyNavigationQueryOverrides } from './environmentQueryOverrides';
import { murciaConfig } from './murciaConfig';

// The parser logs on every recognised override and warns on every rejected one.
// Silenced so a passing run is quiet; the warn calls are asserted where they
// are the behaviour under test.
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const apply = (search: string) =>
  applyNavigationQueryOverrides(murciaConfig, search, true);

describe('the pose parameters reach the config', () => {
  // The three added on 2026-09-05, and the reason this file exists: azimuth and
  // focus are what the debug overlay REPORTS, so if they do not round-trip
  // through a URL the readout is a dead end.
  // NOTE ON THE VALUES BELOW: none of them may equal what murciaConfig already
  // ships. A case that asserts the current default passes whether or not the
  // parameter was read, so it tests nothing — which is precisely how the first
  // draft of this file failed to notice `?azimuth=267` being dropped, 267 being
  // the shipped bearing. Pick numbers the config does not hold.
  it('?azimuth= sets the arrival bearing', () => {
    expect(murciaConfig.camera.azimuthDegrees).not.toBe(42);
    expect(apply('?azimuth=42').camera.azimuthDegrees).toBe(42);
  });

  it('?focusX= and ?focusZ= move the arrival focus', () => {
    const next = apply('?focusX=-100.5&focusZ=42.25');
    expect(next.initialFocus.x).toBe(-100.5);
    expect(next.initialFocus.z).toBe(42.25);
  });

  it('accepts a bearing outside [0, 360) rather than rejecting it', () => {
    // A heading is periodic, so -93 and 267 name the same direction. The
    // overlay reports an unbounded raw azimuth once the viewer has turned
    // through a full circle, and pasting that back must not be refused.
    expect(apply('?azimuth=-93').camera.azimuthDegrees).toBe(-93);
    expect(apply('?azimuth=627').camera.azimuthDegrees).toBe(627);
  });

  it('still carries the pose parameters that predate them', () => {
    const next = apply('?dist=311&elev=23&fov=41&lookAt=-12.5&farPlane=2800');
    expect(next.camera.distance).toBe(311);
    expect(next.camera.elevationDegrees).toBe(23);
    expect(next.camera.fov).toBe(41);
    expect(next.camera.lookAtHeight).toBe(-12.5);
    expect(next.camera.far).toBe(2800);
  });

  it('replays a whole POSE line in one URL', () => {
    // The overlay's copyable line, pasted back as query parameters. This is the
    // round trip the feature is for, so it is asserted as one case rather than
    // inferred from the fields passing individually. Every value differs from
    // the shipped config, for the reason in the note above.
    const next = apply(
      '?dist=311&elev=23&azimuth=42&lookAt=-12.5&fov=41&focusX=-100.25&focusZ=55.75',
    );
    expect(next.camera.distance).toBe(311);
    expect(next.camera.elevationDegrees).toBe(23);
    expect(next.camera.azimuthDegrees).toBe(42);
    expect(next.camera.lookAtHeight).toBe(-12.5);
    expect(next.camera.fov).toBe(41);
    expect(next.initialFocus.x).toBeCloseTo(-100.25, 5);
    expect(next.initialFocus.z).toBeCloseTo(55.75, 5);
  });
});

describe('a lone parameter is not swallowed', () => {
  // THE TRAP THIS FILE GUARDS. `applyNavigationQueryOverrides` returns `env`
  // untouched when every parsed value is null, so a parameter added to the
  // reader but forgotten in the `overrides` array is silently dropped —
  // silently, because the parse succeeds and the early return discards it.
  // Asserted one parameter at a time, since a pair would hide exactly the
  // omission being looked for.
  it.each([
    ['azimuth=99', (c: typeof murciaConfig) => c.camera.azimuthDegrees, 99],
    ['focusX=-7.5', (c: typeof murciaConfig) => c.initialFocus.x, -7.5],
    ['focusZ=8.25', (c: typeof murciaConfig) => c.initialFocus.z, 8.25],
    ['dist=300', (c: typeof murciaConfig) => c.camera.distance, 300],
    ['elev=22', (c: typeof murciaConfig) => c.camera.elevationDegrees, 22],
  ])('?%s survives on its own', (query, read, expected) => {
    expect(read(apply(`?${query}`))).toBe(expected);
  });
});

describe('what it refuses', () => {
  it('ignores a value that is not a number, and says so', () => {
    const next = apply('?azimuth=north');
    expect(next.camera.azimuthDegrees).toBe(murciaConfig.camera.azimuthDegrees);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('ignoring ?azimuth=north'),
    );
  });

  it('ignores an elevation at or past vertical, where azimuth stops meaning anything', () => {
    expect(apply('?elev=90').camera.elevationDegrees).toBe(
      murciaConfig.camera.elevationDegrees,
    );
  });

  it('changes nothing at all when the shell says the tools are off', () => {
    const next = applyNavigationQueryOverrides(
      murciaConfig,
      '?azimuth=267&dist=999&focusX=1',
      false,
    );
    expect(next.camera.azimuthDegrees).toBe(murciaConfig.camera.azimuthDegrees);
    expect(next.camera.distance).toBe(murciaConfig.camera.distance);
    expect(next.initialFocus.x).toBe(murciaConfig.initialFocus.x);
  });

  it('leaves the shared config object untouched', () => {
    const before = murciaConfig.camera.azimuthDegrees;
    apply('?azimuth=123');
    expect(murciaConfig.camera.azimuthDegrees).toBe(before);
  });
});
