// Photo tray and per-panel crop state for the Slash Vice studio. The editor owns the photo
// list, which photo sits in which panel slot, and each slot's zoom/pan; it draws a single
// panel's photo into an already-clipped canvas context and lets main.js compose the page.

const SAMPLE_PHOTOS = [
  { id: 'sample-sunset', name: 'Palm Boulevard', file: 'sunset-boulevard.jpg' },
  { id: 'sample-neon', name: 'Neon Pier', file: 'neon-pier.jpg' },
  { id: 'sample-beach', name: 'Beach Crowd', file: 'beach-sunglasses.jpg' },
  { id: 'sample-coastal', name: 'Classic Convertible', file: 'coastal-convertible.jpg' },
  { id: 'sample-marina', name: 'Sorrento Marina', file: 'marina-golden.jpg' },
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.4;

const CROP_PRESETS = [
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 1.22, panX: -0.72, panY: -0.42 },
  { zoom: 1.38, panX: 0.68, panY: 0.36 },
  { zoom: 1.16, panX: 0.3, panY: -0.7 },
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = source;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function getBounds(points, width, height) {
  const xs = points.map(([x]) => x * width);
  const ys = points.map(([, y]) => y * height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function tracePolygon(context, points, width, height) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x * width, y * height);
    else context.lineTo(x * width, y * height);
  });
  context.closePath();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x, y] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const crosses = (y > point.y) !== (previousY > point.y);
    if (crosses && point.x < ((previousX - x) * (point.y - y)) / (previousY - y) + x) {
      inside = !inside;
    }
  }
  return inside;
}

function cropMetrics(photo, bounds, assignment) {
  const coverScale = Math.max(
    bounds.width / photo.image.naturalWidth,
    bounds.height / photo.image.naturalHeight,
  );
  const scale = coverScale * assignment.zoom;
  const width = photo.image.naturalWidth * scale;
  const height = photo.image.naturalHeight * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, (width - bounds.width) / 2),
    overflowY: Math.max(0, (height - bounds.height) / 2),
  };
}

export function createEditor({
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
  onChange,
}) {
  const photos = [];
  const assignments = new Map();
  let panels = [];
  let selectedPanelId = null;
  let selectedPhotoId = null;
  let uploadSerial = 0;
  let drag = null;

  function selectedAssignment() {
    const assignment = assignments.get(selectedPanelId);
    if (!assignment || !photos.some((photo) => photo.id === assignment.photoId)) return null;
    return assignment;
  }

  function selectedPhoto() {
    const assignment = selectedAssignment();
    return photos.find((photo) => photo.id === assignment?.photoId) ?? null;
  }

  function updateTraySelection() {
    tray.querySelectorAll('[data-photo-id]').forEach((button) => {
      const selected = button.dataset.photoId === selectedPhotoId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function updateControls() {
    const panelIndex = panels.findIndex((panel) => panel.id === selectedPanelId);
    const assignment = selectedAssignment();
    const photo = selectedPhoto();
    const panelNumber = String(Math.max(0, panelIndex) + 1).padStart(2, '0');
    selectionLabel.textContent = `Panel ${panelNumber} · ${photo?.name ?? 'Placeholder scene'}`;
    zoomInput.disabled = !assignment;
    centerButton.disabled = !assignment;
    clearButton.disabled = !assignment;
    zoomInput.value = String(assignment?.zoom ?? 1);
    zoomValue.textContent = `${Math.round((assignment?.zoom ?? 1) * 100)}%`;
    const noPhotos = photos.length === 0;
    autoFillButton.disabled = noPhotos;
    spreadButton.disabled = noPhotos;
    fillOneButton.disabled = noPhotos || !selectedPhotoId;
    canvas.classList.toggle('has-draggable-photo', Boolean(assignment));
    updateTraySelection();
  }

  function notify(message) {
    updateControls();
    onChange?.(message);
  }

  function photoButton(photo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-card';
    button.dataset.photoId = photo.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Use ${photo.name} in the selected panel`);

    const thumbnail = document.createElement('img');
    thumbnail.src = photo.image.src;
    thumbnail.alt = '';
    const name = document.createElement('span');
    name.textContent = photo.name;
    button.append(thumbnail, name);
    button.addEventListener('click', () => {
      selectedPhotoId = photo.id;
      if (selectedPanelId) {
        assignments.set(selectedPanelId, { photoId: photo.id, zoom: 1, panX: 0, panY: 0 });
      }
      notify(`${photo.name} placed in the selected panel`);
    });
    return button;
  }

  function addPhoto(photo) {
    photos.push(photo);
    // User photos lead the tray, so the button goes where the photo lands in the slot order rather
    // than at the end: an upload added after the samples loaded still appears before them, which is
    // the same order Spread and Auto-Fill read from `photos`.
    photos.sort((left, right) => (left.slot ?? Infinity) - (right.slot ?? Infinity));
    tray.insertBefore(photoButton(photo), tray.children[photos.indexOf(photo)] ?? null);
    updateTraySelection();
  }

  function setPanels(nextPanels) {
    panels = nextPanels;
    if (!panels.some((panel) => panel.id === selectedPanelId)) {
      selectedPanelId = panels[0]?.id ?? null;
    }
    notify();
  }

  function drawPanel(context, panel) {
    const assignment = assignments.get(panel.id);
    const photo = photos.find((candidate) => candidate.id === assignment?.photoId);
    if (!assignment || !photo) return false;

    const { width: canvasWidth, height: canvasHeight } = context.canvas;
    const bounds = getBounds(panel.points, canvasWidth, canvasHeight);
    const metrics = cropMetrics(photo, bounds, assignment);
    const x = bounds.x + (bounds.width - metrics.width) / 2 + assignment.panX * metrics.overflowX;
    const y = bounds.y + (bounds.height - metrics.height) / 2 + assignment.panY * metrics.overflowY;

    context.save();
    tracePolygon(context, panel.points, canvasWidth, canvasHeight);
    context.clip();
    context.drawImage(photo.image, x, y, metrics.width, metrics.height);
    context.restore();
    return true;
  }

  function canvasPoint(event) {
    const rectangle = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rectangle.left) / rectangle.width) * canvas.width,
      y: ((event.clientY - rectangle.top) / rectangle.height) * canvas.height,
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    const normalized = { x: point.x / canvas.width, y: point.y / canvas.height };
    const hit = [...panels].reverse().find((panel) => pointInPolygon(normalized, panel.points));
    if (!hit) return;

    selectedPanelId = hit.id;
    const assignment = selectedAssignment();
    const photo = photos.find((candidate) => candidate.id === assignment?.photoId);
    if (assignment && photo) {
      drag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        panX: assignment.panX,
        panY: assignment.panY,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      event.preventDefault();
    }
    notify(`Panel ${String(panels.indexOf(hit) + 1).padStart(2, '0')} selected`);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const assignment = selectedAssignment();
    const panel = panels.find((candidate) => candidate.id === selectedPanelId);
    const photo = photos.find((candidate) => candidate.id === assignment?.photoId);
    if (!assignment || !panel || !photo) return;

    const rectangle = canvas.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.clientX) / rectangle.width) * canvas.width;
    const deltaY = ((event.clientY - drag.clientY) / rectangle.height) * canvas.height;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1 && !drag.moved) return;

    drag.moved = true;
    const bounds = getBounds(panel.points, canvas.width, canvas.height);
    const metrics = cropMetrics(photo, bounds, assignment);
    assignment.panX = metrics.overflowX > 0 ? clamp(drag.panX + deltaX / metrics.overflowX, -1, 1) : 0;
    assignment.panY = metrics.overflowY > 0 ? clamp(drag.panY + deltaY / metrics.overflowY, -1, 1) : 0;
    onChange?.();
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (moved) notify('Photo crop updated');
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

  zoomInput.addEventListener('input', () => {
    const assignment = selectedAssignment();
    if (!assignment) return;
    assignment.zoom = clamp(Number(zoomInput.value) || 1, MIN_ZOOM, MAX_ZOOM);
    notify();
  });

  centerButton.addEventListener('click', () => {
    const assignment = selectedAssignment();
    if (!assignment) return;
    assignment.zoom = 1;
    assignment.panX = 0;
    assignment.panY = 0;
    notify('Photo centered at cover-fit zoom');
  });

  clearButton.addEventListener('click', () => {
    if (!selectedPanelId || !assignments.has(selectedPanelId)) {
      notify('That panel is already empty');
      return;
    }
    assignments.delete(selectedPanelId);
    notify('Panel cleared back to the drawn scene');
  });

  autoFillButton.addEventListener('click', () => {
    if (!photos.length) return;
    const emptyPanels = panels.filter((panel) => {
      const assignment = assignments.get(panel.id);
      return !assignment || !photos.some((photo) => photo.id === assignment.photoId);
    });
    emptyPanels.forEach((panel, index) => {
      assignments.set(panel.id, { photoId: photos[index % photos.length].id, zoom: 1, panX: 0, panY: 0 });
    });
    notify(emptyPanels.length ? `Auto-Fill placed ${emptyPanels.length} photo${emptyPanels.length === 1 ? '' : 's'}` : 'Every panel already has a photo');
  });

  spreadButton.addEventListener('click', () => {
    if (!photos.length) return;
    panels.forEach((panel, index) => {
      assignments.set(panel.id, { photoId: photos[index % photos.length].id, zoom: 1, panX: 0, panY: 0 });
    });
    notify(`Spread ${photos.length} tray photo${photos.length === 1 ? '' : 's'} across ${panels.length} panels`);
  });

  fillOneButton.addEventListener('click', () => {
    const photo = photos.find((candidate) => candidate.id === selectedPhotoId);
    if (!photo) return;
    panels.forEach((panel, index) => {
      const crop = CROP_PRESETS[index % CROP_PRESETS.length];
      assignments.set(panel.id, { photoId: photo.id, ...crop });
    });
    notify(`${photo.name} fills every panel with varied crops`);
  });

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    onChange?.(`Reading ${files.length} local image${files.length === 1 ? '' : 's'}…`);

    const loaded = await Promise.all(files.map(async (file) => {
      try {
        const source = await readAsDataUrl(file);
        const image = await loadImage(source);
        uploadSerial += 1;
        return {
          id: `upload-${Date.now()}-${uploadSerial}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          image,
          // User photos lead the tray: the samples hold slots 0..4, so an upload takes a large
          // negative slot. The serial ascends with each file, so uploads keep their own order and
          // Spread and Auto-Fill serve the user's photos first.
          slot: uploadSerial - 1000000,
        };
      } catch (error) {
        console.warn(`Skipping ${file.name}.`, error);
        return null;
      }
    }));
    const usablePhotos = loaded.filter(Boolean);
    usablePhotos.forEach(addPhoto);
    if (usablePhotos.length) {
      selectedPhotoId = usablePhotos[0].id;
      if (selectedPanelId) {
        assignments.set(selectedPanelId, { photoId: selectedPhotoId, zoom: 1, panX: 0, panY: 0 });
      }
    }
    fileInput.value = '';
    notify(usablePhotos.length
      ? `Added ${usablePhotos.length} local photo${usablePhotos.length === 1 ? '' : 's'} to the tray`
      : 'No readable images were added');
  });

  const ready = Promise.all(SAMPLE_PHOTOS.map(async (sample, slot) => {
    try {
      const source = new URL(`../samples/${sample.file}`, import.meta.url).href;
      const image = await loadImage(source);
      // `slot` pins the sample's place in the tray. The loads finish in whatever order the network
      // serves them, so without it the tray — and every crop the shot pass derives from it — would
      // depend on timing.
      addPhoto({ ...sample, slot, image });
      if (!selectedPhotoId) selectedPhotoId = sample.id;
      notify();
      return true;
    } catch (error) {
      console.warn(`The drawn sample ${sample.file} could not be loaded.`, error);
      return false;
    }
  })).then((results) => {
    photos.sort((left, right) => (left.slot ?? Infinity) - (right.slot ?? Infinity));
    tray.replaceChildren();
    photos.forEach((photo) => tray.append(photoButton(photo)));
    notify();
    return results.filter(Boolean).length;
  });

  updateControls();

  return {
    ready,
    setPanels,
    drawPanel,
    // Composes the whole tray across the current panels with varied crops. The shot pass uses it so
    // a capture shows a finished cover rather than empty outlines; it is the same assignment the
    // Spread and Fill-All buttons make, in one call.
    fillSpread: () => {
      if (!photos.length) return 0;
      panels.forEach((panel, index) => {
        const photo = photos[index % photos.length];
        const crop = CROP_PRESETS[index % CROP_PRESETS.length];
        assignments.set(panel.id, { photoId: photo.id, ...crop });
      });
      notify(`Spread ${photos.length} tray photo${photos.length === 1 ? '' : 's'} across ${panels.length} panels`);
      return panels.length;
    },
    selectPanel: (panelId) => {
      selectedPanelId = panelId;
      notify();
    },
    getSelectedPanelId: () => selectedPanelId,
    getAssignedCount: () => panels.filter((panel) => {
      const assignment = assignments.get(panel.id);
      return assignment && photos.some((photo) => photo.id === assignment.photoId);
    }).length,
    getPhotoCount: () => photos.length,
  };
}
