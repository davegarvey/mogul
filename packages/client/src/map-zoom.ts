/**
 * Map zoom and pan as pure viewBox arithmetic. The full map fits the screen, which
 * leaves its text too small to read, so the player zooms into the part they need.
 * No DOM here, so the clamping rules can be tested headless.
 */

export interface View { x: number; y: number; width: number; height: number }

/** Deepest zoom, as a multiple of the full map. */
export const MAX_ZOOM = 4;

/** How far the view is zoomed in: 1 is the full map. */
export function zoomLevel(view: View, full: View): number {
  return full.width / view.width;
}

/** Keep the view inside the full map, at the full map's aspect ratio. */
export function clampView(view: View, full: View): View {
  const width = Math.min(full.width, Math.max(full.width / MAX_ZOOM, view.width));
  const height = width * (full.height / full.width);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(view.x, full.x, full.x + full.width - width),
    y: clamp(view.y, full.y, full.y + full.height - height),
    width,
    height,
  };
}

/** Zoom by `factor` (above 1 zooms in) keeping the map point `at` fixed on screen. */
export function zoomAt(view: View, full: View, factor: number, at: { x: number; y: number }): View {
  const target = clampView({ ...view, width: view.width / factor }, full);
  const k = target.width / view.width;
  return clampView(
    { x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k, width: target.width, height: target.height },
    full,
  );
}

/** Move the view by a distance in map units. */
export function panBy(view: View, full: View, dx: number, dy: number): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, full);
}
