/**
 * Fit a measured product-content rectangle inside an unchanged image frame.
 * containerAspect is the frame's width / height, not the source image ratio.
 * The parent must be positioned; overflow:hidden clips the measured margins.
 * No source pixels are stretched: both rendered dimensions use the same scale.
 */
export function contentImageStyle(beer, containerAspect) {
  const metadata = beer?.imageContentBounds;
  const bounds = metadata?.bounds;
  if (!metadata || !bounds) return null;

  const { width, height } = metadata;
  const { x, y, width: contentWidth, height: contentHeight } = bounds;
  const values = [width, height, x, y, contentWidth, contentHeight, containerAspect];
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  if (width <= 0 || height <= 0 || contentWidth <= 0 || contentHeight <= 0 || containerAspect <= 0) return null;
  if (x < 0 || y < 0 || x + contentWidth > width || y + contentHeight > height) return null;

  // A virtual frame of (aspect × 1) is sufficient to derive CSS percentages.
  const scale = Math.min(containerAspect / contentWidth, 1 / contentHeight);
  const renderedWidth = width * scale / containerAspect;
  const renderedHeight = height * scale;
  const left = (1 - contentWidth * scale / containerAspect) / 2 - x * scale / containerAspect;
  const top = (1 - contentHeight * scale) / 2 - y * scale;
  if (![renderedWidth, renderedHeight, left, top].every(Number.isFinite)) return null;

  return {
    position: 'absolute',
    width: `${renderedWidth * 100}%`,
    height: `${renderedHeight * 100}%`,
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
  };
}
