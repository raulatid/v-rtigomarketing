/**
 * The brand panels of the Conócenos sky stop: a small square of smoked glass
 * with a client's isotype, beside the satellite that carries it.
 *
 * DOM for the points of interest's reasons (`pointsOfInterest/poiMarkers.ts`):
 * a constant size on screen, the site's own glass, and a picture that is a
 * plain `<img>`. Placed once a frame from client coordinates the host projects
 * after the camera has moved. Nothing here takes a pointer, and the layer is
 * hidden from assistive technology: the marks are decoration over a stop
 * whose plate already says what the visitor can do.
 *
 * The isotype is only fetched the first time its panel shows, so a visit that
 * never reaches the sky costs no requests.
 */

export interface Brand {
  /** Same-origin path to the isotype (`CaseStudy.isotype`). */
  readonly src: string;
  readonly name: string;
}

export interface PlacedPanel {
  readonly brand: number;
  readonly opacity: number;
  /** Client px: where the satellite is. */
  readonly x: number;
  readonly y: number;
}

export interface BrandPanels {
  /** Exactly these panels show; every other one hides. */
  update(panels: readonly PlacedPanel[]): void;
  dispose(): void;
}

interface View {
  readonly element: HTMLElement;
  readonly image: HTMLImageElement;
  readonly brand: Brand;
  shown: boolean;
  transform: string;
  opacity: string;
}

export function createBrandPanels(container: HTMLElement, brands: readonly Brand[]): BrandPanels {
  const root = document.createElement('div');
  root.className = 'about-brands';
  root.setAttribute('aria-hidden', 'true');

  const views: View[] = brands.map((brand) => {
    const element = document.createElement('div');
    element.className = 'about-brands__panel';
    element.dataset.shown = 'false';
    const image = document.createElement('img');
    image.className = 'about-brands__isotype';
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    element.append(image);
    root.append(element);
    return { element, image, brand, shown: false, transform: '', opacity: '' };
  });
  container.append(root);

  return {
    update(panels) {
      const placed = new Map(panels.map((panel) => [panel.brand, panel]));
      views.forEach((view, index) => {
        const panel = placed.get(index);
        const shown = panel !== undefined;
        if (shown !== view.shown) {
          view.shown = shown;
          view.element.dataset.shown = String(shown);
        }
        if (!panel) return;
        if (!view.image.src) view.image.src = view.brand.src;
        // A tenth of a pixel, as the points of interest round: below what the
        // eye sees, and a still satellite writes nothing.
        const transform = `translate3d(${Math.round(panel.x * 10) / 10}px, ${Math.round(panel.y * 10) / 10}px, 0)`;
        if (transform !== view.transform) {
          view.transform = transform;
          view.element.style.transform = transform;
        }
        const opacity = panel.opacity.toFixed(3);
        if (opacity !== view.opacity) {
          view.opacity = opacity;
          view.element.style.opacity = opacity;
        }
      });
    },

    dispose() {
      root.remove();
    },
  };
}
