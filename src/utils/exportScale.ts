// src/utils/exportScale.ts
//
// Choosing the supersampling factor for the PNG export.
//
// Pulled out of FlowVisualization because it had a bug that only appears on a
// graph nobody had exported yet (C-v), and a pure function is the only way to
// test that case without rendering a 20000px graph:
//
//   scale = Math.max(1, Math.min(2 * dpr, MAX / longestSide))
//
// The `Math.max(1, …)` defeated the cap in exactly the situation the cap
// exists for. Once the graph is longer than MAX, `MAX / longestSide` is below
// 1 — that is the whole point, the image must be shrunk to fit — and clamping
// it back up to 1 produced a canvas larger than the browser's limit. Past that
// limit `toDataURL` returns a BLANK image, so the export appeared to succeed
// and saved nothing.

/** Browsers refuse a single canvas beyond roughly 16k px on a side. */
export const MAX_EXPORT_DIMENSION = 12000;

/**
 * Pixels per CSS pixel to rasterise at.
 *
 * Above 1 supersamples for a sharp image; below 1 shrinks an oversized graph
 * so it stays inside the canvas limit. Never zero or negative.
 */
export function computeExportScale(
  exportW: number,
  exportH: number,
  devicePixelRatio = 1,
  maxDimension = MAX_EXPORT_DIMENSION,
): number {
  const longest = Math.max(exportW, exportH);

  // A graph with no measurable size would divide by zero.
  if (!Number.isFinite(longest) || longest <= 0) return 1;

  const sharp = 2 * (devicePixelRatio || 1);
  const fits = maxDimension / longest;

  // The smaller of "as sharp as we would like" and "as large as is allowed".
  // No lower clamp at 1: shrinking is the correct answer for a huge graph.
  const scale = Math.min(sharp, fits);

  // Guard the degenerate end. A scale this small produces an unusable image,
  // but a 1px-wide PNG is still better than a blank one, and the caller warns
  // the user separately.
  return Math.max(scale, 0.01);
}

/** True when the graph had to be shrunk below native size to fit the canvas. */
export function willDownscale(
  exportW: number,
  exportH: number,
  maxDimension = MAX_EXPORT_DIMENSION,
): boolean {
  return Math.max(exportW, exportH) > maxDimension;
}
