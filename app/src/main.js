// Slash Vice — the cover studio shell. Composes the chosen panel layout: every panel is clipped to
// its polygon, filled by the photo the editor assigned (cover-fit, with that panel's zoom and pan),
// or by a procedural sunset scene when the slot is empty. The panels are graded as one composite,
// then the lettering stage draws the title, subtitle, tagline, captions and poster furniture over
// the top, so type never picks up a grade.

import { LAYOUTS, getLayout } from './layouts.js';
import { createEditor } from './editor.js';
import { GRADES, DEFAULT_OPTIONS, getGradeName } from './grades.js';
import {
  DEFAULT_LETTERING,
  loadLetteringFonts,
  getDefaultCaption,
} from './lettering.js';
import { PRESETS, getPreset } from './presets.js';
import { readShot, runShot } from './shots.js';
import {
  POST_SIZES,
  renderCover,
  tracePolygon,
  canvasToBlob,
  downloadBlob,
  exportFileName,
} from './exporter.js';

const PREVIEW_SIZE = 1080;

const clampNumber = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const canvas = document.querySelector('#cover-preview');
const captionInput = document.querySelector('#caption-input');
const layoutPicker = document.querySelector('#layout-picker');
const layoutDescription = document.querySelector('#layout-description');
const status = document.querySelector('#studio-status');
const tray = document.querySelector('#photo-tray');
const fileInput = document.querySelector('#photo-input');
const zoomInput = document.querySelector('#zoom-input');
const zoomValue = document.querySelector('#zoom-value');
const centerButton = document.querySelector('#center-button');
const clearButton = document.querySelector('#clear-button');
const autoFillButton = document.querySelector('#auto-fill-button');
const spreadButton = document.querySelector('#spread-button');
const fillOneButton = document.querySelector('#fill-one-button');
const selectionLabel = document.querySelector('#panel-selection');
const footerSummary = document.querySelector('#footer-summary');
const footerSource = document.querySelector('#footer-source');
const gradePicker = document.querySelector('#grade-picker');
const gradeName = document.querySelector('#grade-name');
const strengthInput = document.querySelector('#strength-input');
const strengthValue = document.querySelector('#strength-value');
const grainInput = document.querySelector('#grain-input');
const grainValue = document.querySelector('#grain-value');
const vignetteInput = document.querySelector('#vignette-input');
const vignetteValue = document.querySelector('#vignette-value');
const halftoneInput = document.querySelector('#halftone-input');
const halftoneValue = document.querySelector('#halftone-value');
const subtitleInput = document.querySelector('#subtitle-input');
const taglineInput = document.querySelector('#tagline-input');
const glowInput = document.querySelector('#glow-input');
const glowValue = document.querySelector('#glow-value');
const starsInput = document.querySelector('#stars-input');
const starsValue = document.querySelector('#stars-value');
const creditsInput = document.querySelector('#credits-input');
const sealInput = document.querySelector('#seal-input');
const panelCaptionInput = document.querySelector('#panel-caption-input');
const panelCaptionNote = document.querySelector('#panel-caption-note');
const presetPicker = document.querySelector('#preset-picker');
const exportSizes = document.querySelector('#export-sizes');
const exportAllButton = document.querySelector('#export-all-button');
const dimensionLabel = document.querySelector('#dimension-label');

const state = {
  layoutId: LAYOUTS[0].id,
  layout: getLayout(LAYOUTS[0].id),
  gradeId: GRADES[0].id,
  gradeOptions: { ...DEFAULT_OPTIONS },
  lettering: { ...DEFAULT_LETTERING, captions: {}, furniture: { ...DEFAULT_LETTERING.furniture } },
  presetId: null,
  // The preview frame. The editor shows a square artboard; a cover shot can pin it to the
  // requested export size so the capture is the render, not a scaled-up preview.
  frame: { width: PREVIEW_SIZE, height: PREVIEW_SIZE },
};

const scenePalettes = [
  {
    sky: ['#332457', '#d85878', '#ffad72'],
    sun: ['#fff5b0', '#ffbf62'],
    skyline: '#38243f',
    ground: ['#744263', '#1c1a35'],
    accent: '#ffd18a',
  },
  {
    sky: ['#172d51', '#476c91', '#f39a84'],
    sun: ['#fff7ca', '#ffcf88'],
    skyline: '#24334b',
    ground: ['#315771', '#111c32'],
    accent: '#a9e4e2',
  },
  {
    sky: ['#451c52', '#b93b76', '#ff795f'],
    sun: ['#ffe696', '#ff9f5c'],
    skyline: '#401d3d',
    ground: ['#622648', '#1a1429'],
    accent: '#ffb27d',
  },
  {
    sky: ['#152c43', '#2e7181', '#efae78'],
    sun: ['#fff4bd', '#ffc46e'],
    skyline: '#1d3844',
    ground: ['#26515a', '#111d2b'],
    accent: '#b6e6cf',
  },
];

// --- colour helpers ---------------------------------------------------------------------------
// Empty panels keep the drawn scene but shift its hue, so a five-panel layout never repeats a
// sunset exactly. Hex in, hex out, so no canvas filter support is required.

function hexToHsl(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  if (delta === 0) return { h: 0, s: 0, l: lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return { h: ((hue * 60) % 360 + 360) % 360, s: saturation, l: lightness };
}

function hslToHex({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const match = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) [red, green] = [chroma, secondary];
  else if (section < 2) [red, green] = [secondary, chroma];
  else if (section < 3) [green, blue] = [chroma, secondary];
  else if (section < 4) [green, blue] = [secondary, chroma];
  else if (section < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const channel = (value) => Math.round((value + match) * 255).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function rotateHue(hex, degrees) {
  if (!degrees) return hex;
  const { h, s, l } = hexToHsl(hex);
  return hslToHex({ h: (h + degrees + 360) % 360, s, l });
}

function shiftedPalette(palette, degrees) {
  if (!degrees) return palette;
  return {
    sky: palette.sky.map((color) => rotateHue(color, degrees)),
    sun: palette.sun.map((color) => rotateHue(color, degrees)),
    skyline: rotateHue(palette.skyline, degrees),
    ground: palette.ground.map((color) => rotateHue(color, degrees)),
    accent: rotateHue(palette.accent, degrees),
  };
}

// --- procedural placeholder scenes ------------------------------------------------------------
// Scenes are drawn in frame-relative units, so an outline can be reused on any export ratio.

function frameOf(target) {
  return { width: target.canvas.width, height: target.canvas.height };
}

function polygonBounds(panel, width, height) {
  const xs = panel.points.map(([x]) => x * width);
  const ys = panel.points.map(([, y]) => y * height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

function drawSun(target, width, height, palette, sceneIndex) {
  const x = width * (sceneIndex % 2 === 0 ? 0.7 : 0.3);
  const y = height * 0.3;
  const radius = Math.min(height * 0.18, width * 0.24);
  const glow = target.createRadialGradient(x, y, radius * 0.2, x, y, radius * 1.8);
  glow.addColorStop(0, 'rgba(255, 225, 158, 0.38)');
  glow.addColorStop(1, 'rgba(255, 183, 126, 0)');
  target.fillStyle = glow;
  target.fillRect(0, 0, width, height * 0.65);

  const disc = target.createLinearGradient(0, y - radius, 0, y + radius);
  disc.addColorStop(0, palette.sun[0]);
  disc.addColorStop(1, palette.sun[1]);
  target.fillStyle = disc;
  target.beginPath();
  target.arc(x, y, radius, 0, Math.PI * 2);
  target.fill();

  target.fillStyle = 'rgba(93, 45, 80, 0.17)';
  for (let stripe = 0; stripe < 4; stripe += 1) {
    const stripeY = y + radius * (0.05 + stripe * 0.23);
    target.fillRect(x - radius, stripeY, radius * 2, 3 + stripe * 1.5);
  }
}

function drawSkyline(target, width, horizon, palette, sceneIndex) {
  const heights = [0.08, 0.15, 0.1, 0.23, 0.13, 0.18, 0.09, 0.27, 0.17, 0.11, 0.2, 0.12];
  const buildingWidth = width / heights.length;

  heights.forEach((heightRatio, index) => {
    const buildingHeight = horizon * heightRatio;
    const x = index * buildingWidth;
    target.fillStyle = palette.skyline;
    target.fillRect(x, horizon - buildingHeight, buildingWidth + 1, buildingHeight);

    if (index % 3 === 1) {
      target.fillRect(x + buildingWidth * 0.45, horizon - buildingHeight - 18, 2, 18);
    }

    target.fillStyle = 'rgba(255, 211, 138, 0.28)';
    for (let row = 0; row < 3; row += 1) {
      if ((index + row + sceneIndex) % 2 === 0) {
        target.fillRect(x + 7, horizon - buildingHeight + 12 + row * 15, 3, 5);
      }
    }
  });
}

function drawPalm(target, x, y, scale, color) {
  target.save();
  target.translate(x, y);
  target.strokeStyle = color;
  target.fillStyle = color;
  target.lineCap = 'round';
  target.lineWidth = 8 * scale;
  target.beginPath();
  target.moveTo(0, 0);
  target.bezierCurveTo(-6 * scale, -55 * scale, 8 * scale, -118 * scale, 22 * scale, -164 * scale);
  target.stroke();

  const crownX = 22 * scale;
  const crownY = -164 * scale;
  const leaves = [
    [-72, -20],
    [-57, -60],
    [-12, -76],
    [49, -58],
    [73, -13],
    [46, 19],
  ];
  target.lineWidth = 6 * scale;
  leaves.forEach(([leafX, leafY]) => {
    target.beginPath();
    target.moveTo(crownX, crownY);
    target.quadraticCurveTo(
      crownX + leafX * 0.45 * scale,
      crownY + (leafY - 20) * 0.45 * scale,
      crownX + leafX * scale,
      crownY + leafY * scale,
    );
    target.stroke();
  });
  target.beginPath();
  target.arc(crownX - 4 * scale, crownY + 5 * scale, 6 * scale, 0, Math.PI * 2);
  target.arc(crownX + 8 * scale, crownY + 7 * scale, 5 * scale, 0, Math.PI * 2);
  target.fill();
  target.restore();
}

function drawGround(target, width, height, horizon, palette, sceneIndex) {
  const ground = target.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, palette.ground[0]);
  ground.addColorStop(1, palette.ground[1]);
  target.fillStyle = ground;
  target.fillRect(0, horizon, width, height - horizon);

  if (sceneIndex % 2 === 0) {
    target.fillStyle = 'rgba(19, 15, 30, 0.6)';
    target.beginPath();
    target.moveTo(width * 0.43, horizon);
    target.lineTo(width * 0.58, horizon);
    target.lineTo(width * 0.95, height);
    target.lineTo(width * 0.06, height);
    target.closePath();
    target.fill();

    target.strokeStyle = palette.accent;
    target.lineWidth = 4;
    target.setLineDash([24, 24]);
    target.beginPath();
    target.moveTo(width * 0.505, horizon + 18);
    target.lineTo(width * 0.505, height);
    target.stroke();
    target.setLineDash([]);
  } else {
    target.strokeStyle = 'rgba(255, 215, 166, 0.22)';
    target.lineWidth = 3;
    for (let ripple = 0; ripple < 9; ripple += 1) {
      const y = horizon + 20 + ripple * 20;
      const inset = (ripple % 3) * 28;
      target.beginPath();
      target.moveTo(inset, y);
      target.lineTo(width - inset - 30, y);
      target.stroke();
    }
  }

  drawPalm(
    target,
    sceneIndex % 2 === 0 ? width * 0.14 : width * 0.86,
    height * 0.98,
    sceneIndex % 2 === 0 ? 0.92 : 0.78,
    palette.skyline,
  );
}

function drawPlaceholderScene(target, panel, sceneIndex) {
  const { width: frameWidth, height: frameHeight } = frameOf(target);
  const palette = shiftedPalette(scenePalettes[sceneIndex % scenePalettes.length], (sceneIndex * 23) % 360);
  const bounds = polygonBounds(panel, frameWidth, frameHeight);
  const width = bounds.width;
  const height = bounds.height;
  const horizon = height * 0.59;

  target.save();
  tracePolygon(target, panel, frameWidth, frameHeight);
  target.clip();
  target.translate(bounds.x, bounds.y);

  const sky = target.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(0.58, palette.sky[1]);
  sky.addColorStop(1, palette.sky[2]);
  target.fillStyle = sky;
  target.fillRect(0, 0, width, height);

  drawSun(target, width, height, palette, sceneIndex);

  target.fillStyle = 'rgba(255, 236, 214, 0.13)';
  for (let band = 0; band < 4; band += 1) {
    const bandX = width * (0.07 + (band % 2) * 0.28);
    const bandY = height * (0.12 + band * 0.085);
    target.fillRect(bandX, bandY, width * (0.3 + (band % 3) * 0.07), 4);
  }

  drawSkyline(target, width, horizon, palette, sceneIndex);
  drawGround(target, width, height, horizon, palette, sceneIndex);

  const shade = target.createLinearGradient(0, 0, width, height);
  shade.addColorStop(0, 'rgba(15, 10, 30, 0.15)');
  shade.addColorStop(0.55, 'rgba(15, 10, 30, 0)');
  shade.addColorStop(1, 'rgba(15, 10, 30, 0.28)');
  target.fillStyle = shade;
  target.fillRect(0, 0, width, height);

  target.fillStyle = 'rgba(255, 246, 226, 0.72)';
  const tagSize = Math.max(9, Math.round((13 * Math.min(frameWidth, frameHeight)) / PREVIEW_SIZE));
  target.font = `700 ${tagSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  target.textAlign = 'left';
  target.textBaseline = 'alphabetic';
  target.fillText(`SCENE 0${(sceneIndex % 9) + 1} / DAYDREAM`, tagSize * 1.7, tagSize * 2.4);
  target.restore();
}

// --- page composition -------------------------------------------------------------------------

let editor = null;

function drawPanels(target, panels) {
  panels.forEach((panel, index) => {
    if (!editor || !editor.drawPanel(target, panel)) drawPlaceholderScene(target, panel, index);
  });
}

// One composer paints the preview and every export (see exporter.js): panels on a scratch surface,
// graded there, lifted onto the frame, then gutters, the selection outline and the type. The
// preview keeps its two surfaces between frames; an export gets fresh ones at its own size.
const previewScratch = document.createElement('canvas');

function renderPreview() {
  const { panels } = state.layout;
  const { width, height } = state.frame;
  renderCover({
    width,
    height,
    panels,
    paintPanels: drawPanels,
    gradeId: state.gradeId,
    gradeOptions: state.gradeOptions,
    lettering: state.lettering,
    selectionId: editor?.getSelectedPanelId() ?? null,
    target: canvas,
    scratch: previewScratch,
  });
  updateFooter();
}

// Switches the live artboard to an export ratio. The editor keeps its square frame; a shot pins
// the frame to the requested size before the first paint.
function setFrame(size) {
  const next = {
    width: Math.max(64, Math.round(size?.width ?? PREVIEW_SIZE)),
    height: Math.max(64, Math.round(size?.height ?? PREVIEW_SIZE)),
  };
  state.frame = next;
  if (canvas.width !== next.width) canvas.width = next.width;
  if (canvas.height !== next.height) canvas.height = next.height;
  canvas.style.aspectRatio = `${next.width} / ${next.height}`;
  if (dimensionLabel) dimensionLabel.textContent = `${next.width} × ${next.height}`;
}

function renderExport(size) {
  const { panels } = state.layout;
  return renderCover({
    width: size.width,
    height: size.height,
    panels,
    paintPanels: drawPanels,
    gradeId: state.gradeId,
    gradeOptions: state.gradeOptions,
    lettering: state.lettering,
  });
}

function updateFooter() {
  const { panels, name } = state.layout;
  const filled = editor?.getAssignedCount() ?? 0;
  const photos = editor?.getPhotoCount() ?? 0;
  footerSummary.textContent = `${name} / ${panels.length} panels / ${filled} photo${filled === 1 ? '' : 's'} placed / ${getGradeName(state.gradeId)}`;
  footerSource.textContent = photos
    ? `${photos} tray photo${photos === 1 ? '' : 's'} · offline`
    : 'Code-drawn · no photo loaded';
}

function buildLayoutPicker() {
  layoutPicker.replaceChildren();
  const families = new Map();
  LAYOUTS.forEach((layout) => {
    if (!families.has(layout.family)) {
      const group = document.createElement('optgroup');
      group.label = layout.family;
      families.set(layout.family, group);
      layoutPicker.append(group);
    }
    const option = document.createElement('option');
    option.value = layout.id;
    option.textContent = layout.name;
    families.get(layout.family).append(option);
  });
  layoutPicker.value = state.layoutId;
}

// Each grade gets a button whose swatch is a small stack of the colours the grade leans on, so the
// picker reads as a film-strip of looks rather than a list of names.
const GRADE_SWATCHES = {
  sunset: ['#ffd76e', '#ff8a5c', '#e8427f'],
  neon: ['#18093a', '#74208f', '#84faff'],
  golden: ['#ffe0a0', '#e8a95e', '#8a5a34'],
  poster: ['#141019', '#e4dcd0', '#ff7a5c'],
  painterly: ['#f6dfc4', '#c98d7a', '#5b4a6b'],
};

function buildGradePicker() {
  gradePicker.replaceChildren();
  GRADES.forEach((grade) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grade-card';
    button.dataset.gradeId = grade.id;
    button.title = grade.note;
    button.setAttribute('aria-pressed', String(grade.id === state.gradeId));

    const swatch = document.createElement('span');
    swatch.className = 'grade-swatch';
    swatch.style.background = `linear-gradient(135deg, ${GRADE_SWATCHES[grade.id].join(', ')})`;
    swatch.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'grade-label';
    label.textContent = grade.name;

    button.append(swatch, label);
    button.addEventListener('click', () => {
      if (state.gradeId === grade.id) return;
      state.gradeId = grade.id;
      syncGradeControls();
      renderPreview();
      status.textContent = `${grade.name} grade applied`;
    });
    gradePicker.append(button);
  });
}

function syncGradeControls() {
  gradePicker.querySelectorAll('[data-grade-id]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.gradeId === state.gradeId));
  });
  gradeName.textContent = getGradeName(state.gradeId);
  strengthInput.value = String(state.gradeOptions.strength);
  strengthValue.textContent = `${state.gradeOptions.strength}%`;
  grainInput.value = String(state.gradeOptions.grain);
  grainValue.textContent = String(state.gradeOptions.grain);
  vignetteInput.value = String(state.gradeOptions.vignette);
  vignetteValue.textContent = String(state.gradeOptions.vignette);
  halftoneInput.value = String(state.gradeOptions.halftone);
  halftoneValue.textContent = String(state.gradeOptions.halftone);
}

// A full grade pass costs tens of milliseconds, so continuous gestures (slider drags, photo pans)
// coalesce into one render per animation frame instead of one per input event.
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderPreview();
  });
}

function bindGradeSlider(input, output, key, suffix = '') {
  input.addEventListener('input', () => {
    state.gradeOptions[key] = Number(input.value);
    output.textContent = `${input.value}${suffix}`;
    scheduleRender();
  });
}

function syncLayoutDescription() {
  const layout = LAYOUTS.find((candidate) => candidate.id === state.layoutId);
  layoutDescription.textContent = layout ? `${layout.description} ${layout.panels.length} panels.` : '';
}

function applyLayout(layoutId) {
  state.layoutId = layoutId;
  state.layout = getLayout(layoutId);
  syncLayoutDescription();
  editor?.setPanels(state.layout.panels);
  syncPanelCaptionControl();
  renderPreview();
}

// --- lettering controls -----------------------------------------------------------------------
// Every lettering field writes straight into state.lettering and re-renders, so typing, toggling a
// furniture switch and changing the star count are the same kind of edit.

function syncLetteringControls() {
  const { lettering } = state;
  captionInput.value = lettering.title;
  subtitleInput.value = lettering.subtitle;
  taglineInput.value = lettering.tagline;
  creditsInput.value = lettering.credits;
  sealInput.value = lettering.sealText;
  glowInput.value = String(Math.round(lettering.glow * 100));
  glowValue.textContent = `${Math.round(lettering.glow * 100)}%`;
  starsInput.value = String(lettering.stars);
  starsValue.textContent = `${lettering.stars} / 5`;
  document.querySelectorAll('[data-furniture]').forEach((input) => {
    input.checked = Boolean(lettering.furniture[input.dataset.furniture]);
    input.closest('.toggle-row')?.classList.toggle('is-on', input.checked);
  });
}

function bindTextInput(input, key) {
  input.addEventListener('input', () => {
    state.lettering[key] = input.value;
    state.presetId = null;
    syncPresetControls();
    scheduleRender();
  });
}

// The caption field edits whichever panel is selected, so clicking a panel in the canvas switches
// which location line the text box is pointed at.
function syncPanelCaptionControl() {
  const panels = state.layout.panels;
  const selectedId = editor?.getSelectedPanelId() ?? panels[0]?.id;
  const index = Math.max(0, panels.findIndex((panel) => panel.id === selectedId));
  const panel = panels[index];
  if (!editedPanelCaption(panel, index).isCustom) {
    // Keep the placeholder in step with the panel the box is currently editing.
    panelCaptionInput.placeholder = getDefaultCaption(index);
  }
  panelCaptionInput.value = editedPanelCaption(panel, index).text;
  panelCaptionNote.textContent = `Panel ${String(index + 1).padStart(2, '0')} of ${panels.length} · the field follows the selected cut`;
}

editor = createEditor({
  canvas,
  tray,
  fileInput,
  zoomInput,
  zoomValue,
  centerButton,
  clearButton,
  autoFillButton,
  spreadButton,
  fillOneButton,
  selectionLabel,
  onChange: (message) => {
    if (message) status.textContent = message;
    syncPanelCaptionControl();
    scheduleRender();
  },
});

function editedPanelCaption(panel, index) {
  if (!panel) return { text: '', isCustom: false };
  const stored = state.lettering.captions[panel.id];
  const isCustom = typeof stored === 'string' && stored.trim().length > 0;
  return { text: isCustom ? stored : getDefaultCaption(index), isCustom };
}

panelCaptionInput.addEventListener('input', () => {
  const panels = state.layout.panels;
  const selectedId = editor?.getSelectedPanelId() ?? panels[0]?.id;
  const index = Math.max(0, panels.findIndex((panel) => panel.id === selectedId));
  const panel = panels[index];
  if (!panel) return;
  const value = panelCaptionInput.value;
  if (value.trim()) state.lettering.captions[panel.id] = value;
  else delete state.lettering.captions[panel.id];
  state.presetId = null;
  syncPresetControls();
  scheduleRender();
});

// --- presets ----------------------------------------------------------------------------------

function syncPresetControls() {
  presetPicker.querySelectorAll('[data-preset-id]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.presetId === state.presetId));
  });
}

function applyPreset(preset) {
  state.presetId = preset.id;
  state.gradeId = preset.gradeId;
  state.gradeOptions = { ...DEFAULT_OPTIONS, ...preset.gradeOptions };
  state.lettering = {
    ...state.lettering,
    ...preset.lettering,
    furniture: { ...DEFAULT_LETTERING.furniture, ...preset.lettering.furniture },
  };
  applyLayout(preset.layoutId);
  // Captions arrive positionally with the preset, so they are keyed to the panel ids of the
  // layout the preset just switched to rather than to whatever layout was on screen before.
  state.lettering.captions = preset.captions.reduce((map, text, index) => {
    const panel = state.layout.panels[index];
    if (panel) map[panel.id] = text;
    return map;
  }, {});
  layoutPicker.value = preset.layoutId;
  syncGradeControls();
  syncLetteringControls();
  syncPresetControls();
  syncPanelCaptionControl();
  renderPreview();
  status.textContent = `${preset.name} preset applied · ${state.layout.name} · ${getGradeName(state.gradeId)}`;
}

function buildPresetPicker() {
  presetPicker.replaceChildren();
  PRESETS.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.dataset.presetId = preset.id;
    button.setAttribute('aria-pressed', 'false');
    button.title = preset.note;

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.name;
    const note = document.createElement('span');
    note.className = 'preset-note';
    note.textContent = preset.note;

    button.append(name, note);
    button.addEventListener('click', () => applyPreset(preset));
    presetPicker.append(button);
  });
}

// --- export -----------------------------------------------------------------------------------
// Every size runs the same composer over the current state at that frame, so a square, a story
// crop and a banner are three views of one cover rather than three separate layouts. The buttons
// are disabled while a batch runs so a double press cannot queue overlapping renders.

let exporting = false;

function setExporting(active) {
  exporting = active;
  exportAllButton.disabled = active;
  exportSizes.querySelectorAll('button').forEach((button) => {
    button.disabled = active;
  });
}

async function exportSize(size) {
  if (exporting) return;
  setExporting(true);
  status.textContent = `Rendering ${size.width} × ${size.height}…`;
  try {
    const frame = renderExport(size);
    const blob = await canvasToBlob(frame);
    downloadBlob(blob, exportFileName(state.layoutId, state.gradeId, size.width, size.height));
    status.textContent = `Exported ${size.width} × ${size.height} · ${Math.round(blob.size / 1024)} KB PNG`;
  } catch (error) {
    console.warn('The cover could not be exported.', error);
    status.textContent = 'That size could not be exported — see the console';
  } finally {
    setExporting(false);
  }
}

async function exportAll() {
  if (exporting) return;
  setExporting(true);
  try {
    for (const size of POST_SIZES) {
      status.textContent = `Rendering ${size.width} × ${size.height}…`;
      const frame = renderExport(size);
      const blob = await canvasToBlob(frame);
      downloadBlob(blob, exportFileName(state.layoutId, state.gradeId, size.width, size.height));
      // Yield between downloads so the browser keeps them as separate files.
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    status.textContent = `Exported all ${POST_SIZES.length} sizes · PNG`;
  } catch (error) {
    console.warn('The cover batch could not be exported.', error);
    status.textContent = 'The batch export failed — see the console';
  } finally {
    setExporting(false);
  }
}

function buildExportControls() {
  exportSizes.replaceChildren();
  POST_SIZES.forEach((size) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-size';
    button.dataset.sizeId = size.id;
    button.title = `Export a ${size.ratio} PNG at ${size.width} × ${size.height}`;

    const name = document.createElement('span');
    name.className = 'export-size-name';
    name.textContent = `${size.name} · ${size.ratio}`;
    const dims = document.createElement('span');
    dims.className = 'export-size-dims';
    dims.textContent = `${size.width}×${size.height}`;
    const note = document.createElement('span');
    note.className = 'export-size-note';
    note.textContent = size.note;

    button.append(name, dims, note);
    button.addEventListener('click', () => exportSize(size));
    exportSizes.append(button);
  });
  exportAllButton.disabled = false;
  exportAllButton.addEventListener('click', exportAll);
}

// --- shot mode -------------------------------------------------------------------------------

function composeSamples() {
  // Editor-mode composer for the capture pass: put every tray photo into the layout with varied
  // crops so the shot reads like a finished cover instead of four empty outlines.
  editor?.fillSpread();
}

function getShotHooks() {
  return {
    applyPreset: (presetId) => applyPreset(getPreset(presetId)),
    setLayout: (layoutId) => {
      const exists = LAYOUTS.some((layout) => layout.id === layoutId);
      if (!exists) return;
      state.presetId = null;
      syncPresetControls();
      layoutPicker.value = layoutId;
      applyLayout(layoutId);
    },
    setGrade: (gradeId) => {
      const exists = GRADES.some((grade) => grade.id === gradeId);
      if (!exists) return;
      state.gradeId = gradeId;
      syncGradeControls();
      renderPreview();
    },
    setFrame,
    composeSamples,
    render: () => renderPreview(),
    whenReady: () => bootReady,
  };
}

buildLayoutPicker();
syncLayoutDescription();
buildGradePicker();
syncGradeControls();
buildPresetPicker();
syncPresetControls();
syncLetteringControls();
buildExportControls();

bindGradeSlider(strengthInput, strengthValue, 'strength', '%');
bindGradeSlider(grainInput, grainValue, 'grain');
bindGradeSlider(vignetteInput, vignetteValue, 'vignette');
bindGradeSlider(halftoneInput, halftoneValue, 'halftone');

bindTextInput(captionInput, 'title');
bindTextInput(subtitleInput, 'subtitle');
bindTextInput(taglineInput, 'tagline');
bindTextInput(creditsInput, 'credits');
bindTextInput(sealInput, 'sealText');

glowInput.addEventListener('input', () => {
  state.lettering.glow = Number(glowInput.value) / 100;
  glowValue.textContent = `${glowInput.value}%`;
  state.presetId = null;
  syncPresetControls();
  scheduleRender();
});

starsInput.addEventListener('input', () => {
  state.lettering.stars = clampNumber(Number(starsInput.value), 1, 5);
  starsValue.textContent = `${state.lettering.stars} / 5`;
  state.presetId = null;
  syncPresetControls();
  scheduleRender();
});

document.querySelectorAll('[data-furniture]').forEach((input) => {
  input.addEventListener('change', () => {
    state.lettering.furniture[input.dataset.furniture] = input.checked;
    input.closest('.toggle-row')?.classList.toggle('is-on', input.checked);
    state.presetId = null;
    syncPresetControls();
    scheduleRender();
  });
});

layoutPicker.addEventListener('change', () => {
  state.presetId = null;
  syncPresetControls();
  applyLayout(layoutPicker.value);
  status.textContent = `${state.layout.name} loaded · ${state.layout.panels.length} panels`;
});

editor.setPanels(state.layout.panels);
syncPanelCaptionControl();
renderPreview();

// One readiness point for both the studio and shot mode: the local fonts and the sample photos are
// in, and the first composed frame is on the canvas.
const bootReady = (async () => {
  let fonts = [];
  try {
    fonts = await loadLetteringFonts();
  } catch (error) {
    console.warn('A local lettering font could not be loaded.', error);
  }
  const loaded = await editor.ready;
  syncPanelCaptionControl();
  renderPreview();
  if (fonts.length) {
    status.textContent = loaded
      ? `Preview ready · ${fonts.join(' + ')} loaded · ${loaded} sample photos in the tray`
      : `Preview ready · ${fonts.join(' + ')} loaded · sample photos unavailable`;
  } else {
    status.textContent = 'Preview ready · a local lettering font could not be loaded';
  }
  return loaded;
})();

await bootReady;

const shot = readShot(window.location.search);
if (shot) await runShot(shot, getShotHooks());
