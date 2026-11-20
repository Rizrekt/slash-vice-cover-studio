// Fixed scenes for the screenshot pass. A shot is a URL, never a click: `?shot=cover` renders the
// finished cover alone, full-viewport, at the requested pixel size; `?shot=editor` opens the studio
// with the sample photos already composed into the panels. Everything a shot sets is ordinary
// studio state, so a shot and a hand-made cover go through the identical panel -> grade -> lettering
// pipeline and a capture is reproducible at any time.
//
// Readiness: the body carries `data-shot-ready="1"` only after the local fonts have loaded and two
// animation frames have painted, so a capture script can poll one attribute instead of guessing.

const SIZE_PATTERN = /^(\d{2,5})x(\d{2,5})$/;

export function parseSize(value) {
  const match = SIZE_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 64 || height < 64 || width > 8192 || height > 8192) return null;
  return { width, height };
}

export function readShot(search) {
  const query = new URLSearchParams(search);
  const mode = query.get('shot');
  if (mode !== 'cover' && mode !== 'editor') return null;
  return {
    mode,
    presetId: query.get('preset'),
    layoutId: query.get('layout'),
    gradeId: query.get('grade'),
    size: parseSize(query.get('size')),
  };
}

function nextFrames(count) {
  return new Promise((resolve) => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

/**
 * Applies a shot to the studio through `hooks`, paints it, and raises the readiness signal.
 * Hooks: applyPreset(id), setLayout(id), setGrade(id), composeSamples(), setFrame(size),
 * render(), whenReady() (resolves once the local fonts and sample photos are in).
 */
export async function runShot(shot, hooks) {
  if (!shot) return false;

  document.body.classList.add(shot.mode === 'cover' ? 'shot-cover' : 'shot-editor');
  document.body.dataset.shot = shot.mode;

  // Readiness first: composing samples before the photos have decoded would silently fall back to
  // the drawn placeholders, and the cover would differ between two runs of the same URL.
  await hooks.whenReady();

  if (shot.presetId) hooks.applyPreset(shot.presetId);
  // An explicit layout or grade in the URL wins over the preset it just applied.
  if (shot.layoutId) hooks.setLayout(shot.layoutId);
  if (shot.gradeId) hooks.setGrade(shot.gradeId);

  if (shot.mode === 'cover') {
    hooks.setFrame(shot.size ?? { width: 1080, height: 1080 });
  }
  hooks.composeSamples();
  hooks.render();

  // Two frames after the paint: one commits the canvas draw, the next proves it settled.
  await nextFrames(2);
  hooks.render();
  await nextFrames(2);

  document.body.dataset.shotReady = '1';
  window.__shotReady = true;
  return true;
}
