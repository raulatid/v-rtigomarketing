import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyCameraTuningQueryOverrides,
  applyNavigationQueryOverrides,
} from './environmentQueryOverrides';
import { murciaConfig } from './murciaConfig';
import { resolveCameraPose, resolveZoomFar } from './environmentConfig';

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
    // Values chosen to differ from what ships, per the note at the top of this
    // file: asserting a shipped default is how ?azimuth= was silently dropped.
    ['zoomNear=0.5', (c: typeof murciaConfig) => c.zoomNearScale, 0.5],
    ['zoomFar=380', (c: typeof murciaConfig) => c.zoomFarDistance, 380],
    // `?touchDragGain=` and `?touchYawDeg=` were the two rows here. They moved
    // the map-pan controller's per-pointer-type gains, and went with it
    // (DECISIONS §44). The rig's touch turn, `?touchYaw=`, is not config and is
    // tested below.
  ])('?%s survives on its own', (query, read, expected) => {
    expect(read(apply(`?${query}`))).toBe(expected);
  });
});

describe('a named term is the pose at every aspect', () => {
  // The portrait overrides are spread OVER `camera` when the pose is resolved,
  // so a parameter that only reached `camera` would do nothing on a phone —
  // the one viewport the portrait pose is judged on.
  it('?dist= reaches a portrait viewport too', () => {
    const next = apply('?dist=333');
    expect(resolveCameraPose(next, 0.5).distance).toBe(333);
    expect(resolveCameraPose(next, 16 / 9).distance).toBe(333);
  });

  it('?zoomFar= and ?zoomFarElev= reach the portrait far end too', () => {
    const next = apply('?zoomFar=444&zoomFarElev=61');
    expect(resolveZoomFar(next, 0.5)).toEqual({ distance: 444, elevationDegrees: 61 });
  });

  it('leaves the portrait terms nobody named alone', () => {
    const next = apply('?azimuth=42');
    expect(resolveCameraPose(next, 0.5).distance).toBe(
      resolveCameraPose(murciaConfig, 0.5).distance,
    );
    expect(resolveZoomFar(next, 0.5)).toEqual(resolveZoomFar(murciaConfig, 0.5));
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

/** The shipped touch numbers; every override below asks for something else. */
const shippedTouch = () => ({
  touchRotationGain: 80,
  touchInertiaFriction: 5,
  touchInertiaMinSpeed: 0.6,
});

describe('?touchYaw= sets the finger turn on the rig tuning', () => {
  // 57, not the shipped 80, per the note at the top of this file.
  const tuningFor = (search: string, enabled = true) => {
    const tuning = shippedTouch();
    applyCameraTuningQueryOverrides(tuning, search, enabled);
    return tuning.touchRotationGain;
  };

  it('writes the gain into the tuning it is given', () => {
    expect(tuningFor('?touchYaw=57')).toBe(57);
  });

  it('refuses a gain that is zero, negative or not a number', () => {
    expect(tuningFor('?touchYaw=0')).toBe(80);
    expect(tuningFor('?touchYaw=-10')).toBe(80);
    expect(tuningFor('?touchYaw=fast')).toBe(80);
  });

  it('changes nothing when the shell says the tools are off', () => {
    expect(tuningFor('?touchYaw=57', false)).toBe(80);
  });
});

describe('?touchInertia= and ?touchFlingMin= set the finger throw', () => {
  const apply = (search: string, enabled = true) => {
    const tuning = shippedTouch();
    applyCameraTuningQueryOverrides(tuning, search, enabled);
    return tuning;
  };

  it('each reaches the tuning on its own', () => {
    expect(apply('?touchInertia=3').touchInertiaFriction).toBe(3);
    expect(apply('?touchFlingMin=0.3').touchInertiaMinSpeed).toBe(0.3);
  });

  it('accepts 0, which turns the carry off or lets any speed throw', () => {
    expect(apply('?touchInertia=0').touchInertiaFriction).toBe(0);
    expect(apply('?touchFlingMin=0').touchInertiaMinSpeed).toBe(0);
  });

  it('refuses a negative or non-numeric value', () => {
    expect(apply('?touchInertia=-1').touchInertiaFriction).toBe(5);
    expect(apply('?touchFlingMin=slow').touchInertiaMinSpeed).toBe(0.6);
  });

  it('changes nothing when the shell says the tools are off', () => {
    expect(apply('?touchInertia=3&touchFlingMin=0.3', false)).toEqual(shippedTouch());
  });
});

describe('?lightmaps= picks which atlases a 2048 device halves', () => {
  const desktop1024 = (search: string) => {
    const lightmaps = apply(search).lightmaps;
    return lightmaps && 'manifest' in lightmaps ? lightmaps.desktop1024 : 'no unified bake';
  };

  it('reads every atlas, none, or a list of keys', () => {
    expect(desktop1024('?lightmaps=all')).toBe('all');
    expect(desktop1024('?lightmaps=none')).toEqual([]);
    expect(desktop1024('?lightmaps=outer-buildings, ground-Outer,')).toEqual(['outer-buildings', 'ground-Outer']);
  });

  it('leaves the pose alone, so it does not trip the footprint warning', () => {
    const next = apply('?lightmaps=all');
    expect(next.camera).toBe(murciaConfig.camera);
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('[murcia pose]'),
      expect.anything(),
    );
  });
});
