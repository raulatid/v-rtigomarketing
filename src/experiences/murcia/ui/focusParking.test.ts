// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCampusOverlay } from '../campus/section/campusOverlay';
import { createAboutScreenPaging } from '../about/aboutScreenPaging';
import { PARKED_ATTRIBUTE } from './focusParking';

// Accessibility audit 2026-11-18, M3: entering, stepping and leaving a section
// dropped the focus to <body>. The plate and the screen stop's arrows now keep
// it through their fade, and pick it up when they arrive.

afterEach(() => {
  document.body.replaceChildren();
});

const labels = { leave: 'volver', previous: 'Anterior', next: 'Siguiente' };
/** One frame: a layer coming back from hidden takes the focus on the next one. */
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const copy = (hasPrevious: boolean, hasNext: boolean) => ({ title: 'GEO', subtitle: 'Uno.', hasPrevious, hasNext });

function plate() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const events = { onClose: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
  const overlay = createCampusOverlay({ labels, container, ...events });
  const layer = container.querySelector<HTMLElement>('.campus-overlay')!;
  const title = layer.querySelector<HTMLElement>('.campus-overlay__title')!;
  const nextArrow = layer.querySelector<HTMLButtonElement>('.campus-overlay__page--next')!;
  const back = layer.querySelector<HTMLButtonElement>('.campus-overlay__back')!;
  return { container, overlay, layer, title, nextArrow, back, events };
}

describe('the plate and the focus', () => {
  it('takes the focus to its title when it arrives with nothing holding it', async () => {
    const { overlay, title } = plate();
    expect(document.activeElement).toBe(document.body);
    overlay.show(copy(true, true));
    await frame();
    expect(document.activeElement).toBe(title);
  });

  it('leaves the focus alone when something outside holds it', async () => {
    const { overlay } = plate();
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    overlay.show(copy(true, true));
    await frame();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('keeps the pressed arrow focused through the flight, inert, and live again on landing', () => {
    const { overlay, layer, nextArrow, events } = plate();
    overlay.show(copy(true, true));
    nextArrow.focus();
    overlay.hide();
    expect(document.activeElement).toBe(nextArrow);
    expect(layer.hasAttribute(PARKED_ATTRIBUTE)).toBe(true);
    expect(layer.style.visibility).toBe('visible');
    expect(nextArrow.getAttribute('aria-disabled')).toBe('true');
    expect(nextArrow.disabled).toBe(false);
    nextArrow.click();
    expect(events.onNext).not.toHaveBeenCalled();

    overlay.show(copy(true, true));
    expect(document.activeElement).toBe(nextArrow);
    expect(layer.hasAttribute(PARKED_ATTRIBUTE)).toBe(false);
    expect(nextArrow.hasAttribute('aria-disabled')).toBe(false);
  });

  it('moves the focus to the title at the end of the row, where the arrow is gone', () => {
    const { overlay, title, nextArrow } = plate();
    overlay.show(copy(true, true));
    nextArrow.focus();
    overlay.hide();
    overlay.show(copy(true, false));
    expect(document.activeElement).toBe(title);
  });

  it('completes the hide when the focus leaves the parked plate', () => {
    const { overlay, layer, nextArrow } = plate();
    overlay.show(copy(true, true));
    nextArrow.focus();
    overlay.hide();
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    expect(layer.hasAttribute(PARKED_ATTRIBUTE)).toBe(false);
    expect(layer.style.visibility).toBe('hidden');
    expect(nextArrow.disabled).toBe(true);
  });

  it('hides as before when it does not hold the focus', () => {
    const { overlay, layer } = plate();
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    overlay.show(copy(true, true));
    overlay.hide();
    expect(layer.hasAttribute(PARKED_ATTRIBUTE)).toBe(false);
    expect(layer.style.visibility).toBe('hidden');
  });

  it('ignores the back arrow while faded', () => {
    const { overlay, back, events } = plate();
    overlay.show(copy(true, true));
    back.focus();
    overlay.hide();
    back.click();
    expect(events.onClose).not.toHaveBeenCalled();
  });
});

describe('the screen stop arrows and the focus', () => {
  function arrows(container: HTMLElement) {
    const paging = createAboutScreenPaging({ container, labels, onPrevious: vi.fn(), onNext: vi.fn() });
    const layer = container.querySelector<HTMLElement>('.about-paging')!;
    const next = layer.querySelector<HTMLButtonElement>('.campus-overlay__page--next')!;
    return { paging, layer, next };
  }

  it('lands the focus on the arrow the stop has when it arrives with nothing holding it', async () => {
    const { container } = plate();
    const { paging, next } = arrows(container);
    paging.show({ hasPrevious: false, hasNext: true });
    await frame();
    expect(document.activeElement).toBe(next);
  });

  it('hands the focus over to the plate of the next stop', async () => {
    const { container, overlay, nextArrow } = plate();
    const { paging, layer, next } = arrows(container);
    paging.show({ hasPrevious: false, hasNext: true });
    next.focus();
    paging.hide();
    expect(document.activeElement).toBe(next);
    overlay.show(copy(true, true));
    expect(document.activeElement).toBe(next);
    await frame();
    expect(document.activeElement).toBe(nextArrow);
    expect(layer.style.visibility).toBe('hidden');
  });
});
