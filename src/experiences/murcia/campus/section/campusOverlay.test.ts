// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createCampusOverlay } from './campusOverlay';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

it('reveals highlights with the figure and resets them when changing service', () => {
  vi.useFakeTimers();
  const overlay = createCampusOverlay({ labels: { leave: 'Back' } });
  const copy = { title: 'SEO', subtitle: 'First line.\nSecond line.', measures: ['Technical structure', 'Search intent', 'Organic performance'] };
  overlay.show(copy);
  const highlights = document.querySelector<HTMLElement>('.campus-overlay__measures')!;
  expect(highlights.style.visibility).toBe('hidden');
  expect(highlights.querySelectorAll('li')).toHaveLength(3);
  overlay.revealCaption();
  expect(highlights.style.visibility).toBe('visible');
  overlay.hide();
  overlay.show({ ...copy, title: 'Analytics' });
  expect(highlights.style.visibility).toBe('hidden');
  overlay.show(copy);
  overlay.revealCaption();
  vi.advanceTimersByTime(500);
  expect(highlights.style.visibility).toBe('visible');
  overlay.dispose();
});
