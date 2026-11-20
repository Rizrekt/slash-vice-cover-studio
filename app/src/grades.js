// The grade stage for the Slash Vice studio. Every grade is a pixel pipeline over the composed
// panel image: read the pixels once, push them through 256-entry lookup tables (or a small
// per-pixel loop when a grade needs luminance), then put them back. The same four finishing
// controls — strength, grain, vignette, halftone — ride on top of whichever grade is chosen.
// Nothing here touches the lettering: main.js runs this on the panel composite before the title
// is drawn, so type stays crisp.

export const DEFAULT_OPTIONS = {
  strength: 80,
  grain: 25,
  vignette: 35,
  halftone: 0,
};

// --- small numeric helpers --------------------------------------------------------------------

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function smoothstep(edgeStart, edgeEnd, value) {
  const t = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return t * t * (3 - 2 * t);
}

// One 256-entry table per channel; `transform` receives a 0..1 value and returns 0..1.
function channelTable(transform) {
  const table = new Uint8ClampedArray(256);
  for (let index = 0; index < 256; index += 1) {
    table[index] = transform(index / 255) * 255;
  }
  return table;
}

function rampTables(stops) {
  const tables = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let index = 0; index < 256; index += 1) {
    const position = index / 255;
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    for (let stop = 0; stop < stops.length - 1; stop += 1) {
      if (position >= stops[stop].at && position <= stops[stop + 1].at) {
        lower = stops[stop];
        upper = stops[stop + 1];
        break;
      }
    }
    const span = Math.max(1e-4, upper.at - lower.at);
    const mix = clamp((position - lower.at) / span, 0, 1);
    for (let channel = 0; channel < 3; channel += 1) {
      tables[channel][index] = lower.rgb[channel] + (upper.rgb[channel] - lower.rgb[channel]) * mix;
    }
  }
  return tables;
}

// Stable per-pixel noise: the same pixel keeps the same speck on every render, so dragging a
// slider does not make the grain crawl.
function noiseAt(x, y, seed) {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function luminanceMap(data, width, height) {
  const lums = new Uint8ClampedArray(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    lums[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }
  return lums;
}

// --- scratch surfaces -------------------------------------------------------------------------
// Golden Hour's glow and Painterly's smoothing both need a downscale/upscale round trip. The
// canvases are reused so a slider drag does not allocate a fresh surface on every frame.

const surfaces = new Map();

function scratchSurface(width, height) {
  const key = `${width}x${height}`;
  let surface = surfaces.get(key);
  if (!surface) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    surface = { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
    surfaces.set(key, surface);
  }
  return surface;
}

// Blur by shrinking to 1/factor and growing back with smoothing on — cheap, and soft enough for
// a glow or a brush pass.
function blurredBuffer(image, factor) {
  const { width, height } = image;
  const source = scratchSurface(width, height);
  source.context.putImageData(image, 0, 0);

  const smallWidth = Math.max(1, Math.round(width / factor));
  const smallHeight = Math.max(1, Math.round(height / factor));
  const small = scratchSurface(smallWidth, smallHeight);
  small.context.clearRect(0, 0, smallWidth, smallHeight);
  small.context.imageSmoothingEnabled = true;
  small.context.imageSmoothingQuality = 'high';
  small.context.drawImage(source.canvas, 0, 0, smallWidth, smallHeight);

  source.context.clearRect(0, 0, width, height);
  source.context.imageSmoothingEnabled = true;
  source.context.imageSmoothingQuality = 'high';
  source.context.drawImage(small.canvas, 0, 0, width, height);

  return source.context.getImageData(0, 0, width, height).data;
}

// --- grade one: Sunset ------------------------------------------------------------------------
// Warm lift in the shadows, a pulled-back blue channel, a saturation push, and highlighths that
// roll off toward orange-pink rather than clipping to white.

const SUNSET_RED = channelTable((value) => Math.min(1, value ** 0.9 * 0.96 + 0.055));
const SUNSET_GREEN = channelTable((value) => Math.min(1, value ** 0.96 * 0.97 + 0.028));
const SUNSET_BLUE = channelTable((value) => Math.min(1, value ** 1.16 * 0.965));
const SUNSET_HIGHLIGHT = [255, 176, 140];

function applySunset(image) {
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    let red = SUNSET_RED[data[index]];
    let green = SUNSET_GREEN[data[index + 1]];
    let blue = SUNSET_BLUE[data[index + 2]];

    const luma = red * 0.299 + green * 0.587 + blue * 0.114;
    red = luma + (red - luma) * 1.24;
    green = luma + (green - luma) * 1.24;
    blue = luma + (blue - luma) * 1.2;

    const heat = smoothstep(0.6, 1, luma / 255) * 0.4;
    red += (SUNSET_HIGHLIGHT[0] - red) * heat;
    green += (SUNSET_HIGHLIGHT[1] - green) * heat;
    blue += (SUNSET_HIGHLIGHT[2] - blue) * heat;

    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
  }
}

// --- grade two: Neon Duotone ------------------------------------------------------------------
// Luminance drives a three-stop ramp: deep purple in the shadows, magenta through the mids, cyan
// at the top. Each channel gets the same ramp index, which is what makes it read as a duotone.

const NEON_RAMP = rampTables([
  { at: 0, rgb: [24, 9, 54] },
  { at: 0.42, rgb: [116, 22, 146] },
  { at: 0.72, rgb: [255, 47, 154] },
  { at: 1, rgb: [132, 250, 255] },
]);

function applyNeon(image) {
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const luma = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255;
    const shaped = clamp((luma - 0.5) * 1.14 + 0.52, 0, 1);
    const entry = Math.round(shaped * 255);
    data[index] = NEON_RAMP[0][entry];
    data[index + 1] = NEON_RAMP[1][entry];
    data[index + 2] = NEON_RAMP[2][entry];
  }
}

// --- grade three: Golden Hour -----------------------------------------------------------------
// A golden wash with lifted shadows and a gentle contrast pull, then a soft glow screened back in
// from a heavily downscaled copy of the frame.

const GOLDEN_RED = channelTable((value) => Math.min(1, 0.15 + value * 0.93));
const GOLDEN_GREEN = channelTable((value) => Math.min(1, 0.11 + value * 0.89));
const GOLDEN_BLUE = channelTable((value) => Math.min(1, 0.055 + value * 0.8));

function applyGoldenHour(image) {
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = GOLDEN_RED[data[index]];
    data[index + 1] = GOLDEN_GREEN[data[index + 1]];
    data[index + 2] = GOLDEN_BLUE[data[index + 2]];
  }

  const glow = blurredBuffer(image, 16);
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const base = data[index + channel];
      const light = glow[index + channel] * 1.04;
      const screened = 255 - ((255 - base) * (255 - Math.min(255, light))) / 255;
      data[index + channel] = base + (screened - base) * 0.34;
    }
  }
}

// --- grade four: Poster Ink -------------------------------------------------------------------
// Five flat levels per channel, then a Sobel pass over the original luminance that darkens the
// strong gradients toward black, so silhouettes keep an inked contour.

const POSTER_STEP = 255 / 4;

function applyPosterInk(image) {
  const { data, width, height } = image;
  const lums = luminanceMap(data, width, height);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.round(data[index] / POSTER_STEP) * POSTER_STEP;
    data[index + 1] = Math.round(data[index + 1] / POSTER_STEP) * POSTER_STEP;
    data[index + 2] = Math.round(data[index + 2] / POSTER_STEP) * POSTER_STEP;
  }

  const lum = (x, y) => lums[y * width + x];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gradientX =
        lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1) -
        (lum(x - 1, y - 1) + 2 * lum(x - 1, y) + lum(x - 1, y + 1));
      const gradientY =
        lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1) -
        (lum(x - 1, y - 1) + 2 * lum(x, y - 1) + lum(x + 1, y - 1));
      const edge = clamp(Math.hypot(gradientX, gradientY) / 1020, 0, 1);
      if (edge < 0.04) continue;

      const shade = smoothstep(0.04, 0.62, edge) * 0.8;
      const index = (y * width + x) * 4;
      data[index] *= 1 - shade;
      data[index + 1] *= 1 - shade;
      data[index + 2] *= 1 - shade;
    }
  }
}

// --- grade five: Painterly --------------------------------------------------------------------
// Nine soft levels, a little smoothing from a downscale/upscale pass, and a breath of fine grain
// so the flat areas read as brushwork instead of banding.

const PAINTERLY_STEP = 255 / 8;

function applyPainterly(image) {
  const { data, width, height } = image;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.round(data[index] / PAINTERLY_STEP) * PAINTERLY_STEP;
    data[index + 1] = Math.round(data[index + 1] / PAINTERLY_STEP) * PAINTERLY_STEP;
    data[index + 2] = Math.round(data[index + 2] / PAINTERLY_STEP) * PAINTERLY_STEP;
  }

  const softened = blurredBuffer(image, 5);
  for (let pixel = 0; pixel < data.length / 4; pixel += 1) {
    const index = pixel * 4;
    const x = pixel % width;
    const y = (pixel - x) / width;
    const dust = (noiseAt(x, y, 17) - 0.5) * 9;
    for (let channel = 0; channel < 3; channel += 1) {
      const blended = data[index + channel] + (softened[index + channel] - data[index + channel]) * 0.48;
      data[index + channel] = blended + dust;
    }
  }
}

// --- shared finishing controls ----------------------------------------------------------------

// Normalised distance from the centre, cached per canvas size: the vignette needs it on every
// pixel of every frame, and the frame size never changes during a session.
const radialFields = new Map();

function radialField(width, height) {
  const key = `${width}x${height}`;
  const cached = radialFields.get(key);
  if (cached) return cached;

  const field = new Float32Array(width * height);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.hypot(centerX, centerY) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      field[y * width + x] = Math.hypot(x - centerX, y - centerY) / maxDistance;
    }
  }
  radialFields.set(key, field);
  return field;
}

function blendTowardOriginal(data, original, amount) {
  if (amount >= 1) return;
  for (let index = 0; index < data.length; index += 4) {
    data[index] += (original[index] - data[index]) * (1 - amount);
    data[index + 1] += (original[index + 1] - data[index + 1]) * (1 - amount);
    data[index + 2] += (original[index + 2] - data[index + 2]) * (1 - amount);
  }
}

function applyFinishing(image, settings) {
  const { data, width, height } = image;
  const grain = clamp(settings.grain, 0, 100) / 100;
  const vignette = clamp(settings.vignette, 0, 100) / 100;
  const halftone = clamp(settings.halftone, 0, 100) / 100;
  if (grain === 0 && vignette === 0 && halftone === 0) return;

  const distances = vignette > 0 ? radialField(width, height) : null;
  const cell = 7.5;
  const diagonal = Math.SQRT1_2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      let red = data[index];
      let green = data[index + 1];
      let blue = data[index + 2];

      if (grain > 0) {
        const speck = (noiseAt(x, y, 31) - 0.5) * 44 * grain;
        red += speck;
        green += speck;
        blue += speck;
      }

      if (vignette > 0) {
        const shade = 1 - smoothstep(0.42, 1.02, distances[pixel]) * 0.84 * vignette;
        red *= shade;
        green *= shade;
        blue *= shade;
      }

      if (halftone > 0) {
        const across = (x * diagonal + y * diagonal) / cell;
        const down = (y * diagonal - x * diagonal) / cell;
        const offsetX = across - Math.floor(across) - 0.5;
        const offsetY = down - Math.floor(down) - 0.5;
        const luma = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
        const radius = 0.62 * Math.sqrt(clamp(1 - luma, 0, 1)) + 0.05;
        const ink = offsetX * offsetX + offsetY * offsetY < radius * radius ? 0.52 : 1.22;
        const factor = 1 + (ink - 1) * halftone;
        red *= factor;
        green *= factor;
        blue *= factor;
      }

      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
    }
  }
}

// --- the public stage -------------------------------------------------------------------------

const GRADES = [
  {
    id: 'sunset',
    name: 'Sunset',
    note: 'Warm lift, punchy colour, orange-pink highlights.',
    apply: applySunset,
  },
  {
    id: 'neon',
    name: 'Neon Duotone',
    note: 'Purple shadows into magenta and cyan.',
    apply: applyNeon,
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    note: 'Golden wash, lifted shadows, soft glow.',
    apply: applyGoldenHour,
  },
  {
    id: 'poster',
    name: 'Poster Ink',
    note: 'Five ink levels with darkened edges.',
    apply: applyPosterInk,
  },
  {
    id: 'painterly',
    name: 'Painterly',
    note: 'Soft posterise, smoothed brush pass, fine grain.',
    apply: applyPainterly,
  },
];

export { GRADES };

export function getGrade(gradeId) {
  return GRADES.find((grade) => grade.id === gradeId) ?? GRADES[0];
}

export function getGradeName(gradeId) {
  return getGrade(gradeId).name;
}

/**
 * Grades the canvas in place. `gradeId` picks one of the five pipelines, `options` overrides any
 * of DEFAULT_OPTIONS. Returns false when the canvas cannot be read (for example a tainted one)
 * so the caller can show the ungraded composite instead of failing the whole render.
 */
export function applyGrade(context, width, height, gradeId, options = {}) {
  if (!(width > 0 && height > 0)) return false;

  let image;
  try {
    image = context.getImageData(0, 0, width, height);
  } catch (error) {
    console.warn('The graded pass could not read the composed cover.', error);
    return false;
  }

  const settings = { ...DEFAULT_OPTIONS, ...options };
  const original = settings.strength < 100 ? new Uint8ClampedArray(image.data) : null;

  getGrade(gradeId).apply(image, { width, height });

  if (original) blendTowardOriginal(image.data, original, clamp(settings.strength, 0, 100) / 100);
  applyFinishing(image, settings);

  context.putImageData(image, 0, 0);
  return true;
}
