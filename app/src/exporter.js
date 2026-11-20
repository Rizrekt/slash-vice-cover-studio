// The export stage for the Slash Vice studio. One composer drives the live preview and every
// export: panels are painted on a scratch canvas at the target size, graded in place, lifted onto
// the frame, then the gutters and the lettering are drawn over the top. Panel geometry is
// normalised and the lettering is sized from the frame's own height, so the same state composes at
// 1:1, 4:5 and 16:9 without stretching type or hand-tuning each ratio.
//
// Determinism: nothing in the render path reads the clock or a random source. Grain is hashed from
// pixel coordinates and the barcode from a fixed seed, so two renders of one state at one size are
// identical byte for byte.

import { applyGrade } from './grades.js';
import { drawLettering } from './lettering.js';

const INK = '#100b15';
const BASE_SIZE = 1080;
const BASE_GUTTER = 11;
const SELECTION_INK = 'rgba(255, 198, 92, 0.9)';

export const POST_SIZES = [
  { id: 'square', name: 'Square', ratio: '1:1', width: 1080, height: 1080, note: 'feed post' },
  { id: 'portrait', name: 'Portrait', ratio: '4:5', width: 1080, height: 1350, note: 'story / poster' },
  { id: 'landscape', name: 'Landscape', ratio: '16:9', width: 1920, height: 1080, note: 'wide banner' },
];

// Gutters are a hairline at 1080 across, so they scale with the short side: a 16:9 frame gets the
// same visual weight as the square one instead of a seam that looks thinner as the frame widens.
function gutterWidth(width, height) {
  return Math.max(4, Math.round((BASE_GUTTER * Math.min(width, height)) / BASE_SIZE));
}

export function tracePolygon(context, panel, width, height) {
  context.beginPath();
  panel.points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x * width, y * height);
    else context.lineTo(x * width, y * height);
  });
  context.closePath();
}

function drawPanelBorders(context, panels, width, height) {
  context.save();
  context.strokeStyle = INK;
  context.lineWidth = gutterWidth(width, height);
  context.lineJoin = 'miter';
  context.miterLimit = 2;
  panels.forEach((panel) => {
    tracePolygon(context, panel, width, height);
    context.stroke();
  });
  context.restore();
}

// Only the live preview asks for this; exports pass no selection so the dashed outline never
// lands in a PNG.
function drawSelection(context, panel, width, height) {
  if (!panel) return;
  context.save();
  context.strokeStyle = SELECTION_INK;
  context.lineWidth = Math.max(2, Math.round((3 * Math.min(width, height)) / BASE_SIZE));
  context.setLineDash([16, 11].map((step) => Math.round((step * Math.min(width, height)) / BASE_SIZE)));
  tracePolygon(context, panel, width, height);
  context.stroke();
  context.restore();
}

function sizedCanvas(candidate, width, height) {
  const canvas = candidate ?? document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
}

/**
 * Composes one cover frame. `paintPanels(context, panels)` is the caller's panel stage (photos or
 * the drawn placeholders) so the preview and the exports share a single implementation of it.
 * `target` and `scratch` may be passed back in to reuse surfaces across frames; without them the
 * frame is drawn onto fresh canvases. Returns the frame canvas.
 */
export function renderCover({
  width,
  height,
  panels,
  paintPanels,
  gradeId,
  gradeOptions,
  lettering,
  selectionId = null,
  target = null,
  scratch = null,
}) {
  const canvas = sizedCanvas(target, width, height);
  const context = canvas.getContext('2d');

  // The graded composite lives on its own surface: the grade must only touch photo pixels, never
  // the gutters, the selection outline or the type drawn afterwards.
  const composite = sizedCanvas(scratch, width, height);
  const compositeContext = composite.getContext('2d', { willReadFrequently: true });
  compositeContext.fillStyle = INK;
  compositeContext.fillRect(0, 0, width, height);
  paintPanels(compositeContext, panels);
  applyGrade(compositeContext, width, height, gradeId, gradeOptions);

  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  context.drawImage(composite, 0, 0);

  drawPanelBorders(context, panels, width, height);
  const selected = selectionId ? panels.find((panel) => panel.id === selectionId) : null;
  drawSelection(context, selected, width, height);
  drawLettering(context, width, height, { ...lettering, panels });

  return canvas;
}

export function exportFileName(layoutId, gradeId, width, height) {
  const slug = (value) => String(value || 'cover').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `slash-vice-${slug(layoutId)}-${slug(gradeId)}-${width}x${height}.png`;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The canvas could not be encoded as a PNG.'));
    }, 'image/png');
  });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a turn to start before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
