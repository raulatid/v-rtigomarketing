/**
 * Windows as a painted quad: the front view of a window prototype.
 *
 * Prototype for «ventanas como shader» of
 * `docs/audits/reports/murcia-light-and-geometry-alternatives-2026-11-20.md` §4.
 * Instead of drawing each window's 30–80 triangles, each window is one quad on
 * its wall that samples a picture of the prototype seen straight on. The
 * picture is rasterized here, in the client, from the prototype geometry the
 * GLB already carries, so it adds no bytes.
 *
 * What it holds per texel: the frontmost face's vertex colour times its shade
 * (`shadeOf`, the same constants the inherited geometry uses), and coverage in
 * alpha. Faces seen edge-on (jambs, the lintel soffit) do not show from the
 * front, so the reveal's shade is lost: the quad is flat by construction.
 *
 * Pure: plain arrays, no three.js, so it runs under Vitest.
 */

export interface WindowFront {
  /** Texels per side of level 0; every level is square and a power of two. */
  size: number;
  /** The prototype's extent in its local x and y: the quad's corners. */
  minX: number; maxX: number; minY: number; maxY: number;
  /** The prototype's back plane, local z. */
  backZ: number;
  /** RGBA8 per level, finest first: sRGB-encoded colour, straight alpha. */
  levels: Uint8Array[];
  /** Fraction of level 0 the prototype covers. */
  coverage: number;
}

/** Samples per texel side at level 0, for antialiased coverage. */
const SUPERSAMPLE = 2;

/**
 * Rasterizes the prototype seen from +Z (it faces out along local +Z,
 * `facadeRecords.ts`) into a square mip chain.
 *
 * `colours` holds `colourSize` linear values per vertex (alpha ignored).
 * `shadeOf` gets the face's unit normal turned towards the viewer.
 */
export function rasterizeWindowFront(
  positions: ArrayLike<number>,
  colours: ArrayLike<number> | null,
  colourSize: number,
  index: ArrayLike<number> | null,
  size: number,
  shadeOf: (nx: number, ny: number, nz: number) => number,
): WindowFront {
  if (!Number.isInteger(Math.log2(size))) throw new Error(`[windowFront] size ${size} is not a power of two`);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, backZ = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    backZ = Math.min(backZ, positions[i + 2]);
  }
  const fine = size * SUPERSAMPLE;
  const depth = new Float32Array(fine * fine).fill(-Infinity);
  const colour = new Float32Array(fine * fine * 3);
  const sx = fine / (maxX - minX), sy = fine / (maxY - minY);
  const triangles = (index ? index.length : positions.length / 3) / 3;
  const corner = (f: number, c: number) => (index ? index[f * 3 + c] : f * 3 + c);

  for (let f = 0; f < triangles; f += 1) {
    const a = corner(f, 0), b = corner(f, 1), c = corner(f, 2);
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) continue;
    nx /= length; ny /= length; nz /= length;
    // The visible side faces the viewer at +Z; the winding is not trusted.
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    if (nz < 1e-3) continue; // edge-on: covers nothing from the front
    const shade = shadeOf(nx, ny, nz);
    // Texel space; the y axis runs up, as a GL texture's rows do.
    const px = [(ax - minX) * sx, (bx - minX) * sx, (cx - minX) * sx];
    const py = [(ay - minY) * sy, (by - minY) * sy, (cy - minY) * sy];
    const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
    if (Math.abs(area) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor(Math.min(...px))), i1 = Math.min(fine - 1, Math.ceil(Math.max(...px)));
    const j0 = Math.max(0, Math.floor(Math.min(...py))), j1 = Math.min(fine - 1, Math.ceil(Math.max(...py)));
    for (let j = j0; j <= j1; j += 1) {
      const y = j + 0.5;
      for (let i = i0; i <= i1; i += 1) {
        const x = i + 0.5;
        const wa = ((px[1] - x) * (py[2] - y) - (px[2] - x) * (py[1] - y)) / area;
        const wb = ((px[2] - x) * (py[0] - y) - (px[0] - x) * (py[2] - y)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = wa * az + wb * bz + wc * cz;
        const t = j * fine + i;
        if (z <= depth[t]) continue;
        depth[t] = z;
        for (let ch = 0; ch < 3; ch += 1) {
          const value = colours
            ? wa * colours[a * colourSize + ch] + wb * colours[b * colourSize + ch] + wc * colours[c * colourSize + ch]
            : 1;
          colour[t * 3 + ch] = value * shade;
        }
      }
    }
  }

  // Level 0, premultiplied linear: box-filter the supersamples.
  const premultiplied: Float32Array[] = [];
  const base = new Float32Array(size * size * 4);
  for (let j = 0; j < fine; j += 1) {
    for (let i = 0; i < fine; i += 1) {
      const t = j * fine + i;
      if (depth[t] === -Infinity) continue;
      const o = ((j / SUPERSAMPLE | 0) * size + (i / SUPERSAMPLE | 0)) * 4;
      const w = 1 / (SUPERSAMPLE * SUPERSAMPLE);
      base[o] += colour[t * 3] * w; base[o + 1] += colour[t * 3 + 1] * w; base[o + 2] += colour[t * 3 + 2] * w;
      base[o + 3] += w;
    }
  }
  premultiplied.push(base);
  for (let s = size / 2; s >= 1; s /= 2) {
    const from = premultiplied[premultiplied.length - 1], to = new Float32Array(s * s * 4);
    for (let j = 0; j < s; j += 1) {
      for (let i = 0; i < s; i += 1) {
        for (let ch = 0; ch < 4; ch += 1) {
          const at = (y: number, x: number) => from[(y * s * 2 + x) * 4 + ch];
          to[(j * s + i) * 4 + ch] = (at(2 * j, 2 * i) + at(2 * j, 2 * i + 1) + at(2 * j + 1, 2 * i) + at(2 * j + 1, 2 * i + 1)) / 4;
        }
      }
    }
    premultiplied.push(to);
  }

  // Straight colour, coarsest first so an empty texel takes the colour of the
  // level above it («pull»): a bilinear tap across the coverage edge then
  // blends towards the window's own colour, not towards black.
  const straight: Float32Array[] = new Array(premultiplied.length);
  for (let l = premultiplied.length - 1; l >= 0; l -= 1) {
    const s = size >> l, p = premultiplied[l], out = new Float32Array(s * s * 3);
    for (let t = 0; t < s * s; t += 1) {
      const alpha = p[t * 4 + 3];
      for (let ch = 0; ch < 3; ch += 1) {
        if (alpha > 0) out[t * 3 + ch] = p[t * 4 + ch] / alpha;
        else if (l + 1 < premultiplied.length) {
          const j = (t / s | 0) >> 1, i = (t % s) >> 1;
          out[t * 3 + ch] = straight[l + 1][(j * (s >> 1) + i) * 3 + ch];
        }
      }
    }
    straight[l] = out;
  }
  const levels = premultiplied.map((p, l) => {
    const s = size >> l, out = new Uint8Array(s * s * 4);
    for (let t = 0; t < s * s; t += 1) {
      for (let ch = 0; ch < 3; ch += 1) out[t * 4 + ch] = Math.round(linearToSrgb(straight[l][t * 3 + ch]) * 255);
      out[t * 4 + 3] = Math.round(Math.min(1, p[t * 4 + 3]) * 255);
    }
    return out;
  });
  let covered = 0;
  for (let t = 0; t < size * size; t += 1) covered += base[t * 4 + 3];
  return { size, minX, maxX, minY, maxY, backZ, levels, coverage: covered / (size * size) };
}

function linearToSrgb(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
