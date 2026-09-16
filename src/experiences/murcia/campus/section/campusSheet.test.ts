// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCampusSheet } from './campusSheet';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function setup(offsetHeight = 500) {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('DOMMatrixReadOnly', class { m42 = 190; });
  const layer = document.createElement('div');
  const body = document.createElement('div');
  layer.append(body);
  document.body.append(layer);
  Object.defineProperty(layer, 'offsetHeight', { value: offsetHeight });
  const sheet = attachCampusSheet(layer, body, { expand: 'Leer más', collapse: 'Ver partículas' });
  const grip = layer.querySelector('button')!;
  grip.setPointerCapture = vi.fn();
  grip.hasPointerCapture = () => false;
  const pointer = (type: string, y: number) => {
    const event = new Event(type);
    Object.assign(event, { pointerId: 1, clientY: y, button: 0, isPrimary: true });
    grip.dispatchEvent(event);
  };
  const dragUp = () => {
    pointer('pointerdown', 400);
    pointer('pointermove', 200);
    pointer('pointerup', 200);
  };
  return { layer, body, grip, sheet, pointer, dragUp };
}

describe('campus sheet input ownership', () => {
  it('does not treat the click following a drag as a second toggle', () => {
    const r = setup();
    r.dragUp();
    r.grip.dispatchEvent(new MouseEvent('click', { detail: 1 }));
    expect(r.layer.dataset.sheetStop).toBe('expanded');
    expect(r.grip.getAttribute('aria-expanded')).toBe('true');
    r.sheet.dispose();
  });

  it('accepts keyboard activation after a touch drag that produced no click', () => {
    const r = setup();
    r.dragUp();
    r.grip.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    expect(r.layer.dataset.sheetStop).toBe('compact');
    expect(r.grip.getAttribute('aria-expanded')).toBe('false');
    r.sheet.dispose();
  });

  it('cancels a drag without changing its stop and releases listeners on disposal', () => {
    const r = setup();
    r.pointer('pointerdown', 400);
    r.pointer('pointermove', 250);
    r.pointer('pointercancel', 250);
    expect(r.layer.dataset.sheetStop).toBe('compact');
    expect(r.layer.style.transform).toBe('');
    expect(r.layer.hasAttribute('data-sheet-dragging')).toBe(false);
    r.sheet.dispose();
    r.grip.click();
    expect(r.layer.dataset.sheetStop).toBe('compact');
    expect(r.layer.querySelector('button')).toBeNull();
  });

  it('withdraws the grip and opens in full when the copy fits the compact stop', () => {
    // jsdom's innerHeight is 768, so the compact stop is 268.8px: 200px of
    // copy has nothing to expand, 500px does.
    const short = setup(200);
    short.sheet.fit();
    expect(short.grip.hidden).toBe(true);
    expect(short.layer.dataset.sheetStop).toBe('expanded');
    expect(short.layer.hasAttribute('data-sheet-measuring')).toBe(false);
    short.sheet.dispose();
    document.body.replaceChildren();

    const tall = setup(500);
    tall.sheet.fit();
    expect(tall.grip.hidden).toBe(false);
    expect(tall.layer.dataset.sheetStop).toBe('compact');
    tall.sheet.dispose();
  });
});
