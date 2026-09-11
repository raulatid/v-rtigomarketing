/**
 * An SVG's markup as pixels, for sampling.
 *
 * The markup is handed to an `Image` through a Blob URL and drawn into a
 * square canvas. It is never inserted into the document, so nothing in it
 * can run: the browser rasterises it as an image, scripts and all ignored,
 * which is why an icon library kept in code is safe to feed here.
 *
 * The SVG must declare a square `width` and `height` (or `viewBox`): an
 * image with no intrinsic size is drawn at the browser's default 300×150
 * and would come out stretched.
 */
export function svgToMask(svg: string, px = 256): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('[service-campus] no 2D context for the svg mask'));
        return;
      }
      ctx.drawImage(image, 0, 0, px, px);
      resolve(ctx.getImageData(0, 0, px, px));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('[service-campus] an icon did not rasterise; is it valid SVG with a size?'));
    };
    image.src = url;
  });
}
