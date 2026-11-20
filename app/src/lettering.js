// Lettering and poster furniture for the Slash Vice cover. Everything in this module is drawn
// after the grade has been baked into the panels, so type keeps its own colours no matter which
// preset sits underneath it: a sunset-gradient title over a dark outline and a stacked 3D
// extrude, a script subtitle with a neon halo, a tracked tagline, one location caption per
// panel, and four pieces of decoration that can be switched off independently.

export const FONT_DISPLAY = 'Anton';
export const FONT_SCRIPT = 'Kaushan Script';

const DISPLAY_STACK = `"${FONT_DISPLAY}", "Arial Black", sans-serif`;
const SCRIPT_STACK = `"${FONT_SCRIPT}", "Brush Script MT", cursive`;

const TITLE_TOP = 0.108;
const TITLE_SIZE_CAP = 0.215;
const TITLE_MIN_SINGLE = 0.15;
const TITLE_MAX_WIDTH = 0.9;

const DEFAULT_CAPTIONS = [
  'MARINA DEL SOL · 7:40 PM',
  'OCEAN DRIVE · 8:15 PM',
  'THE NEON STRIP · 11:05 PM',
  'PALM COURT · 6:20 PM',
  'PIER NINE · LAST LIGHT',
  'SUNSET BOULEVARD · 9:50 PM',
];

// The bottom rail is shared: the credit bar spans the full width, the seal is stamped over its
// left end and the barcode sits inside its right end. These numbers keep the three from fighting.
const RAIL_TOP = 0.916;
const RAIL_HEIGHT = 0.058;
const BARCODE_BOX = { left: 0.822, right: 0.952, top: 0.924, bottom: 0.962 };

export const DEFAULT_LETTERING = {
  title: 'SLASH VICE',
  subtitle: 'sun, sin & second chances',
  tagline: 'EVERY PARADISE HAS A PRICE',
  glow: 0.65,
  stars: 4,
  captions: {},
  credits: 'SLASH STUDIO · A SLASH VICE PICTURE · IN COLOUR · 2026',
  sealText: 'SLASH VICE ORIGINAL · EST. 2026',
  barcodeSeed: 'SLASH-VICE-0001',
  furniture: {
    badges: true,
    seal: true,
    ribbon: true,
    barcode: true,
  },
};

export function getDefaultCaption(index) {
  return DEFAULT_CAPTIONS[index % DEFAULT_CAPTIONS.length];
}

export function captionFor(state, panel, index) {
  const caption = state.captions?.[panel.id];
  if (typeof caption === 'string' && caption.trim()) return caption;
  return getDefaultCaption(index);
}

export async function loadLetteringFonts() {
  const faces = [
    [FONT_DISPLAY, new URL('../assets/fonts/Anton-Regular.ttf', import.meta.url).href],
    [FONT_SCRIPT, new URL('../assets/fonts/KaushanScript-Regular.ttf', import.meta.url).href],
  ];
  const loaded = await Promise.all(faces.map(async ([family, href]) => {
    const face = new FontFace(family, `url("${href}")`);
    await face.load();
    document.fonts.add(face);
    return family;
  }));
  return loaded;
}

// --- small drawing helpers --------------------------------------------------------------------

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(from, to, amount) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const channel = (index) => Math.round(start[index] + (end[index] - start[index]) * amount)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function roundedRect(context, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
}

function traceStar(context, centerX, centerY, outerRadius, innerRadius) {
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function measureTracked(context, text, tracking) {
  let total = 0;
  for (const character of text) total += context.measureText(character).width + tracking;
  return Math.max(0, total - tracking);
}

// Canvas has no letter-spacing in every engine, so tracked lines place one glyph at a time.
function drawTracked(context, text, x, y, tracking, align = 'center') {
  const total = measureTracked(context, text, tracking);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const savedAlign = context.textAlign;
  context.textAlign = 'left';
  for (const character of text) {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + tracking;
  }
  context.textAlign = savedAlign;
  return total;
}

// Glyphs sit on a circle and rotate with it: clockwise for the crown of the seal, anticlockwise
// at the bottom so the lower half still reads the right way up.
function drawArcText(context, text, centerX, centerY, radius, options) {
  const { centerAngle, clockwise = true, tracking = 0 } = options;
  const characters = [...text];
  const advances = characters.map((character) => context.measureText(character).width + tracking);
  const totalWidth = advances.reduce((sum, value) => sum + value, 0);
  if (!totalWidth) return;

  const totalAngle = totalWidth / radius;
  let angle = clockwise ? centerAngle - totalAngle / 2 : centerAngle + totalAngle / 2;

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  characters.forEach((character, index) => {
    const step = (advances[index] / radius) * (clockwise ? 1 : -1);
    const glyphAngle = angle + step / 2;
    angle += step;
    if (character.trim() === '') return;
    context.save();
    context.translate(centerX + Math.cos(glyphAngle) * radius, centerY + Math.sin(glyphAngle) * radius);
    context.rotate(glyphAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2));
    context.fillText(character, 0, 0);
    context.restore();
  });
  context.restore();
}

function panelBounds(polygon, width, height) {
  const xs = polygon.map(([x]) => x * width);
  const ys = polygon.map(([, y]) => y * height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

// --- title ------------------------------------------------------------------------------------
// One line if it can stay big, otherwise the words are split at whichever space leaves the two
// halves closest in width, so a long title stacks instead of shrinking into a whisper.

function measureAt(context, text, size) {
  context.font = `${size}px ${DISPLAY_STACK}`;
  return context.measureText(text).width;
}

function fitSize(context, text, maxWidth, cap) {
  const width = measureAt(context, text, cap);
  if (width <= maxWidth) return cap;
  return Math.floor(cap * (maxWidth / Math.max(1, width)));
}

function layoutTitle(context, text, width, height) {
  const cleaned = (text || '').trim().replace(/\s+/g, ' ').toUpperCase() || 'SLASH VICE';
  const maxWidth = width * TITLE_MAX_WIDTH;
  const cap = height * TITLE_SIZE_CAP;
  const words = cleaned.split(' ');
  const singleSize = fitSize(context, cleaned, maxWidth, cap);

  if (singleSize >= height * TITLE_MIN_SINGLE || words.length < 2) {
    return { lines: [cleaned], size: Math.max(singleSize, height * 0.05) };
  }

  let best = { lines: [cleaned], size: singleSize };
  for (let cut = 1; cut < words.length; cut += 1) {
    const head = words.slice(0, cut).join(' ');
    const tail = words.slice(cut).join(' ');
    const size = Math.min(fitSize(context, head, maxWidth, cap), fitSize(context, tail, maxWidth, cap));
    if (size > best.size) best = { lines: [head, tail], size };
  }
  return best;
}

function drawTitle(context, width, height, state) {
  const { lines, size } = layoutTitle(context, state.title, width, height);
  const top = height * TITLE_TOP;
  const step = size * 0.88;
  const baselines = lines.map((_, index) => top + size * 0.76 + index * step);
  const gradientTop = top;
  const gradientBottom = baselines[baselines.length - 1] + size * 0.06;
  const depth = Math.max(4, Math.round(size * 0.055));

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = `${size}px ${DISPLAY_STACK}`;
  context.lineJoin = 'round';
  context.miterLimit = 2;

  // The extrude is a stack of dark copies, farthest (and dimmest) first, so the face reads as a
  // solid slab of type rather than a drop shadow.
  for (let layer = depth; layer >= 1; layer -= 1) {
    const spread = layer / depth;
    context.fillStyle = mixHex('#33113a', '#0b040f', spread);
    const offsetX = layer * size * 0.0105;
    const offsetY = layer * size * 0.021;
    lines.forEach((line, index) => {
      context.fillText(line, width / 2 - offsetX, baselines[index] + offsetY);
    });
  }

  context.strokeStyle = '#170b20';
  context.lineWidth = Math.max(9, size * 0.105);
  lines.forEach((line, index) => context.strokeText(line, width / 2, baselines[index]));

  const sunsetInk = context.createLinearGradient(0, gradientTop, 0, gradientBottom);
  sunsetInk.addColorStop(0, '#fff5b4');
  sunsetInk.addColorStop(0.24, '#ffd95e');
  sunsetInk.addColorStop(0.54, '#ffa14a');
  sunsetInk.addColorStop(0.8, '#ff6076');
  sunsetInk.addColorStop(1, '#ee3f95');
  context.fillStyle = sunsetInk;
  lines.forEach((line, index) => context.fillText(line, width / 2, baselines[index]));

  context.restore();
  return { bottom: baselines[baselines.length - 1] + size * 0.1, size };
}

// --- subtitle and tagline ---------------------------------------------------------------------

function drawSubtitle(context, width, height, state, top) {
  const text = (state.subtitle || '').trim();
  if (!text) return top;

  let size = height * 0.058;
  context.save();
  context.font = `${size}px ${SCRIPT_STACK}`;
  const measured = context.measureText(text).width;
  if (measured > width * 0.72) {
    size = Math.max(height * 0.03, size * (width * 0.72) / measured);
    context.font = `${size}px ${SCRIPT_STACK}`;
  }

  const baseline = top + height * 0.062;
  const glow = clamp(state.glow ?? 0, 0, 1);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';

  if (glow > 0.02) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.shadowColor = 'rgba(255, 62, 166, 0.95)';
    context.shadowBlur = height * 0.05 * glow;
    context.fillStyle = 'rgba(255, 96, 188, 0.55)';
    context.fillText(text, width / 2, baseline);

    context.shadowColor = 'rgba(84, 240, 255, 0.9)';
    context.shadowBlur = height * 0.034 * glow;
    context.fillStyle = 'rgba(94, 238, 255, 0.42)';
    context.fillText(text, width / 2, baseline);
    context.restore();
  }

  context.shadowColor = 'rgba(24, 6, 28, 0.55)';
  context.shadowBlur = height * 0.006;
  context.fillStyle = '#fff1fb';
  context.fillText(text, width / 2, baseline);
  context.restore();

  return baseline;
}

function drawTagline(context, width, height, state, subtitleBaseline) {
  const text = (state.tagline || '').trim().toUpperCase();
  if (!text) return;

  const maxSize = height * 0.0205;
  const maxWidth = width * 0.66;
  let size = maxSize;
  // Tracking is a fraction of the point size, so it has to shrink with the type. Scaling it in
  // place keeps the drawn line and the rules beside it on the same measurement.
  let tracking = size * 0.42;
  context.save();
  context.font = `${size}px ${DISPLAY_STACK}`;
  context.textBaseline = 'alphabetic';
  let total = measureTracked(context, text, tracking);
  if (total > maxWidth) {
    size = Math.max(height * 0.012, size * (maxWidth / total));
    tracking = size * 0.42;
    context.font = `${size}px ${DISPLAY_STACK}`;
    total = measureTracked(context, text, tracking);
  }

  const baseline = subtitleBaseline + height * 0.048;
  const gap = size * 0.9;
  const rule = Math.max(18, width * 0.05);

  context.strokeStyle = 'rgba(255, 154, 122, 0.85)';
  context.lineWidth = Math.max(1.4, height * 0.0022);
  context.beginPath();
  context.moveTo(width / 2 - total / 2 - gap - rule, baseline - size * 0.3);
  context.lineTo(width / 2 - total / 2 - gap, baseline - size * 0.3);
  context.moveTo(width / 2 + total / 2 + gap, baseline - size * 0.3);
  context.lineTo(width / 2 + total / 2 + gap + rule, baseline - size * 0.3);
  context.stroke();

  context.shadowColor = 'rgba(12, 5, 18, 0.7)';
  context.shadowBlur = height * 0.008;
  context.fillStyle = '#ffe8d3';
  drawTracked(context, text, width / 2, baseline, tracking);
  context.restore();
}

// --- per-panel location captions --------------------------------------------------------------

// The horizontal extent of a panel polygon at one height. Slanted cuts are narrow at one end of
// the page, so a chip centred on the anchor can otherwise spill across the seam into its
// neighbour; this is what keeps every caption inside the panel it belongs to.
function panelSpanAt(polygon, sliceY, width, height) {
  const points = polygon.map(([x, y]) => [x * width, y * height]);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[previous];
    if ((y1 > sliceY) === (y2 > sliceY)) continue;
    const x = x1 + ((sliceY - y1) / (y2 - y1)) * (x2 - x1);
    if (x < minimum) minimum = x;
    if (x > maximum) maximum = x;
  }
  return Number.isFinite(minimum) ? { left: minimum, right: maximum } : null;
}

function drawCaptions(context, width, height, state, panels) {
  panels.forEach((panel, index) => {
    const anchor = panel.labelAnchor;
    if (!anchor) return;

    const text = captionFor(state, panel, index).trim().toUpperCase();
    if (!text) return;

    const bounds = panelBounds(panel.points, width, height);
    let size = Math.max(9, height * 0.0155);
    let tracking = size * 0.13;
    context.save();
    context.font = `${size}px ${DISPLAY_STACK}`;

    const padX = size * 0.85;
    const padY = size * 0.62;
    const chrome = padX * 2 + size * 0.5 + Math.max(2.5, size * 0.22) + padX * 0.55;
    const inset = Math.max(6, height * 0.008);

    // The chip hangs in the lower third of its panel, in the column its label anchor names. It is
    // never allowed past the bottom rail, because that strip belongs to the seal and barcode.
    const railTop = height * 0.9;
    let chipHeight = size + padY * 2;
    const anchorY = anchor.y * height + bounds.height * 0.16;
    const centerY = Math.min(
      Math.max(anchorY, bounds.y + chipHeight / 2 + inset),
      bounds.y + bounds.height - chipHeight / 2 - inset,
      railTop - chipHeight / 2,
    );

    // Fit the type to the panel's own width at that height, not to the canvas width.
    const span = panelSpanAt(panel.points, centerY, width, height);
    const spanLeft = span ? span.left + inset : bounds.x + inset;
    const spanRight = span ? span.right - inset : bounds.x + bounds.width - inset;
    const available = Math.max(48, spanRight - spanLeft - chrome);

    let textWidth = measureTracked(context, text, tracking);
    if (textWidth > available) {
      const scale = available / textWidth;
      size = Math.max(6.5, size * scale);
      tracking = size * 0.13;
      context.font = `${size}px ${DISPLAY_STACK}`;
      textWidth = measureTracked(context, text, tracking);
      chipHeight = size + padY * (size / (height * 0.0155));
    }

    const chipWidth = textWidth + padX * 2 + size * 0.5;
    const centerX = anchor.x * width;
    const left = clamp(centerX - chipWidth / 2, spanLeft, Math.max(spanLeft, spanRight - chipWidth));
    const top = centerY - chipHeight / 2;

    roundedRect(context, left, top, chipWidth, chipHeight, chipHeight * 0.28);
    context.fillStyle = 'rgba(13, 8, 20, 0.62)';
    context.fill();
    context.strokeStyle = 'rgba(255, 236, 214, 0.26)';
    context.lineWidth = Math.max(1, height * 0.0012);
    context.stroke();

    const tick = Math.max(2.5, size * 0.22);
    context.fillStyle = '#ff745f';
    context.fillRect(left + padX * 0.55, top + chipHeight * 0.24, tick, chipHeight * 0.52);

    context.fillStyle = '#ffe9d4';
    context.textBaseline = 'middle';
    drawTracked(
      context,
      text,
      left + padX * 0.55 + tick + padX * 0.55,
      top + chipHeight / 2 + size * 0.06,
      tracking,
      'left',
    );
    context.restore();
  });
}

// --- furniture ---------------------------------------------------------------------------------

function drawBadges(context, width, height, state) {
  if (!state.furniture.badges) return;

  const stars = clamp(Math.round(state.stars ?? 4), 1, 5);
  const radius = height * 0.0145;
  const gap = radius * 2.5;
  const pillSize = height * 0.0165;
  const pillText = 'WANTED';
  const pillTracking = pillSize * 0.24;

  context.save();
  context.font = `${pillSize}px ${DISPLAY_STACK}`;
  const pillLabelWidth = measureTracked(context, pillText, pillTracking);
  const pillPadX = height * 0.019;
  const pillHeight = height * 0.042;
  const pillWidth = pillLabelWidth + pillPadX * 2;
  const pillRight = width * 0.965;
  const pillLeft = pillRight - pillWidth;
  const pillTop = height * 0.036;

  roundedRect(context, pillLeft, pillTop, pillWidth, pillHeight, pillHeight / 2);
  context.fillStyle = 'rgba(18, 9, 22, 0.86)';
  context.fill();
  context.strokeStyle = '#ffc65c';
  context.lineWidth = Math.max(1.5, height * 0.0022);
  context.stroke();

  context.fillStyle = '#ffc65c';
  context.textBaseline = 'middle';
  drawTracked(
    context,
    pillText,
    pillLeft + pillWidth / 2,
    pillTop + pillHeight / 2 + pillSize * 0.05,
    pillTracking,
  );

  const starCenterY = pillTop + pillHeight / 2;
  const starRight = pillLeft - height * 0.022;
  for (let index = 0; index < 5; index += 1) {
    const centerX = starRight - radius - index * gap;
    traceStar(context, centerX, starCenterY, radius, radius * 0.46);
    if (index < stars) {
      const gold = context.createLinearGradient(0, starCenterY - radius, 0, starCenterY + radius);
      gold.addColorStop(0, '#fff2ba');
      gold.addColorStop(1, '#ffab3f');
      context.fillStyle = gold;
      context.fill();
      context.strokeStyle = 'rgba(72, 30, 12, 0.65)';
      context.lineWidth = Math.max(1, radius * 0.12);
      context.stroke();
    } else {
      context.strokeStyle = 'rgba(255, 238, 214, 0.45)';
      context.lineWidth = Math.max(1, radius * 0.12);
      context.stroke();
    }
  }
  context.restore();
}

function splitSealText(text) {
  const clean = text.trim();
  const middle = clean.length / 2;
  let cut = -1;
  for (let index = 0; index < clean.length; index += 1) {
    if (clean[index] === '·' || clean[index] === '-' || clean[index] === '|') {
      if (cut === -1 || Math.abs(index - middle) < Math.abs(cut - middle)) cut = index;
    }
  }
  if (cut === -1) return [clean, ''];
  return [clean.slice(0, cut).trim(), clean.slice(cut + 1).trim()];
}

function drawSeal(context, width, height, state) {
  if (!state.furniture.seal) return;

  const centerX = width * 0.108;
  const centerY = height * (RAIL_TOP - 0.006);
  const radius = height * 0.062;
  const teeth = 30;

  context.save();
  // A dark halo behind the stamp so the seal separates from whatever panel edge sits under it.
  context.beginPath();
  context.arc(centerX, centerY, radius * 1.12, 0, Math.PI * 2);
  context.fillStyle = 'rgba(10, 5, 14, 0.72)';
  context.fill();

  context.beginPath();
  for (let tooth = 0; tooth < teeth * 2; tooth += 1) {
    const toothRadius = tooth % 2 === 0 ? radius : radius * 0.9;
    const angle = (tooth * Math.PI) / teeth - Math.PI / 2;
    const x = centerX + Math.cos(angle) * toothRadius;
    const y = centerY + Math.sin(angle) * toothRadius;
    if (tooth === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  const paper = context.createLinearGradient(0, centerY - radius, 0, centerY + radius);
  paper.addColorStop(0, '#fbefdd');
  paper.addColorStop(1, '#e6d2b8');
  context.fillStyle = paper;
  context.fill();
  context.strokeStyle = '#1a0d1e';
  context.lineWidth = Math.max(1.5, height * 0.0022);
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
  const core = context.createRadialGradient(centerX, centerY - radius * 0.2, radius * 0.05, centerX, centerY, radius * 0.7);
  core.addColorStop(0, '#3d1230');
  core.addColorStop(1, '#150a1c');
  context.fillStyle = core;
  context.fill();
  context.strokeStyle = 'rgba(246, 231, 210, 0.55)';
  context.lineWidth = Math.max(1, height * 0.0014);
  context.stroke();

  // The ring text is inked, not reversed: dark letters on the cream disc read at poster distance
  // where a light-on-light ring turns to mush.
  const [crown, foot] = splitSealText(state.sealText || DEFAULT_LETTERING.sealText);
  const ringSize = Math.max(6, radius * 0.15);
  context.font = `${ringSize}px ${DISPLAY_STACK}`;
  context.fillStyle = '#241026';
  const ringRadius = radius * 0.845;
  drawArcText(context, crown, centerX, centerY, ringRadius, {
    centerAngle: -Math.PI / 2,
    clockwise: true,
    tracking: ringSize * 0.16,
  });
  if (foot) {
    drawArcText(context, foot, centerX, centerY, ringRadius, {
      centerAngle: Math.PI / 2,
      clockwise: false,
      tracking: ringSize * 0.16,
    });
  }

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${radius * 0.46}px ${DISPLAY_STACK}`;
  context.fillStyle = '#ffc65c';
  context.fillText('SV', centerX, centerY - radius * 0.1);
  traceStar(context, centerX, centerY + radius * 0.3, radius * 0.1, radius * 0.045);
  context.fillStyle = '#ffe0a4';
  context.fill();
  context.restore();
}

function drawRibbon(context, width, height, state) {
  if (!state.furniture.ribbon) return;

  const top = height * RAIL_TOP;
  const barHeight = height * RAIL_HEIGHT;
  const barBottom = top + barHeight;

  context.save();
  const strip = context.createLinearGradient(0, top, 0, barBottom);
  strip.addColorStop(0, 'rgba(14, 8, 20, 0.9)');
  strip.addColorStop(1, 'rgba(9, 5, 14, 0.95)');
  context.fillStyle = strip;
  context.fillRect(0, top, width, barHeight);
  context.strokeStyle = 'rgba(255, 236, 214, 0.3)';
  context.lineWidth = Math.max(1, height * 0.0014);
  context.beginPath();
  context.moveTo(0, top);
  context.lineTo(width, top);
  context.moveTo(0, barBottom);
  context.lineTo(width, barBottom);
  context.stroke();

  const credits = (state.credits || DEFAULT_LETTERING.credits).toUpperCase();
  const leftLimit = width * (state.furniture.seal ? 0.19 : 0.04);
  const rightLimit = width * (state.furniture.barcode ? 0.81 : 0.96);
  const available = rightLimit - leftLimit;
  let size = height * 0.0132;
  let tracking = size * 0.34;
  context.font = `${size}px ${DISPLAY_STACK}`;
  let textWidth = measureTracked(context, credits, tracking);
  if (textWidth > available) {
    size = Math.max(height * 0.008, size * available / textWidth);
    tracking = size * 0.34;
    context.font = `${size}px ${DISPLAY_STACK}`;
    textWidth = measureTracked(context, credits, tracking);
  }
  context.fillStyle = '#efe2d2';
  context.textBaseline = 'middle';
  drawTracked(context, credits, (leftLimit + rightLimit) / 2, top + barHeight * 0.53, tracking);
  context.restore();
}

function barcodeBars(seed, count) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bars = [];
  let state = hash >>> 0 || 1;
  for (let index = 0; index < count; index += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    // 1..3 units of ink, 1..2 units of paper: a readable strip, still deterministic per seed.
    bars.push({ ink: 1 + (state % 3), paper: 1 + ((state >>> 5) % 2) });
  }
  return bars;
}

function drawBarcode(context, width, height, state) {
  if (!state.furniture.barcode) return;

  const right = width * BARCODE_BOX.right;
  const left = width * BARCODE_BOX.left;
  const top = height * BARCODE_BOX.top;
  const barBottom = height * (BARCODE_BOX.top + (BARCODE_BOX.bottom - BARCODE_BOX.top) * 0.66);
  const captionTop = height * (BARCODE_BOX.top + (BARCODE_BOX.bottom - BARCODE_BOX.top) * 0.72);
  const seed = state.barcodeSeed || DEFAULT_LETTERING.barcodeSeed;
  const bars = barcodeBars(seed, 32);
  const units = bars.reduce((sum, bar) => sum + bar.ink + bar.paper, 0);
  const unit = (right - left) / units;

  context.save();
  context.fillStyle = 'rgba(244, 231, 212, 0.95)';
  context.fillRect(
    left - unit * 1.4,
    height * (BARCODE_BOX.top - 0.005),
    right - left + unit * 2.8,
    height * (BARCODE_BOX.bottom - BARCODE_BOX.top + 0.011),
  );

  context.fillStyle = 'rgba(22, 12, 26, 0.94)';
  let cursor = left;
  bars.forEach((bar) => {
    context.fillRect(cursor, top, bar.ink * unit, barBottom - top);
    cursor += (bar.ink + bar.paper) * unit;
  });

  const label = seed.replace(/[^A-Z0-9]/gi, '').slice(-10).toUpperCase() || 'SLASHVICE';
  const labelSize = height * 0.0098;
  context.font = `${labelSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillStyle = 'rgba(22, 12, 26, 0.9)';
  context.textBaseline = 'top';
  drawTracked(context, label, left, captionTop, labelSize * 0.14, 'left');
  context.restore();
}

// --- the public stage ---------------------------------------------------------------------------

export function drawLettering(context, width, height, lettering) {
  const input = lettering ?? {};
  const state = {
    ...DEFAULT_LETTERING,
    ...input,
    furniture: { ...DEFAULT_LETTERING.furniture, ...(input.furniture ?? {}) },
    captions: { ...(input.captions ?? {}) },
  };
  const panels = Array.isArray(input.panels) ? input.panels : [];

  context.save();
  context.textBaseline = 'alphabetic';

  // A soft scrim under the type only: panels stay readable, the title keeps its contrast on a
  // bright sky, and nothing is baked into the graded composite. A two-line title pushes the
  // subtitle and tagline lower, so the fade runs to just past them.
  const scrim = context.createLinearGradient(0, 0, 0, height * 0.62);
  scrim.addColorStop(0, 'rgba(9, 5, 15, 0.66)');
  scrim.addColorStop(0.42, 'rgba(9, 5, 15, 0.36)');
  scrim.addColorStop(0.78, 'rgba(9, 5, 15, 0.11)');
  scrim.addColorStop(1, 'rgba(9, 5, 15, 0)');
  context.fillStyle = scrim;
  context.fillRect(0, 0, width, height * 0.62);

  const title = drawTitle(context, width, height, state);
  const subtitleBaseline = drawSubtitle(context, width, height, state, title.bottom);
  drawTagline(context, width, height, state, subtitleBaseline);
  drawCaptions(context, width, height, state, panels);

  drawBadges(context, width, height, state);
  // Ribbon first, seal last: the stamp is supposed to sit on top of the credit bar.
  drawRibbon(context, width, height, state);
  drawSeal(context, width, height, state);
  drawBarcode(context, width, height, state);

  context.restore();
  return { titleBottom: title.bottom, titleSize: title.size };
}
