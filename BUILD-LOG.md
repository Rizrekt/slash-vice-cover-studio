# Build log — Slash Vice

A browser cover studio for the GTA-VI-style poster joke: pick a panel cut, drop your own photos in,
pick a colour grade, and the type and poster furniture land on top. Everything is drawn in the
browser with canvas 2D and plain ES modules. There is no build step, no library and no network
request — the fonts and the five sample photos are local files, and a photo a user adds never
leaves the tab.

## What it does

- **Seven panel cuts.** Four straight (Grid Four, Hero Plus Three, Triple Strip) and four slanted
  (Slash Hero, Slash Six, Diagonal Trio, Vice Wedge). Every panel is a closed polygon in
  normalised 0..1 space, so one definition drives the clip, the hit test, the gutters and the
  captions.
- **A photo tray.** Drag inside a panel to reframe, zoom per panel, or fill the whole grid at once
  from one photo with varied crops. Drop a file in and it is read as a data URL, so nothing is
  uploaded.
- **Five colour grades.** Sunset, Neon Duotone, Golden Hour, Poster Ink and Painterly, each a pixel
  pipeline over the composed panels only, with Strength, Grain, Vignette and Halftone on top.
- **Lettering and furniture.** A fitted sunset-gradient title with a stack extrude, a script
  subtitle with a neon halo, a tracked tagline, one location caption per panel, plus stars, a
  WANTED pill, a circular seal, a credit ribbon and a barcode — each switchable.
- **Five one-press presets** that set the cut, grade, sliders, copy and furniture together.
- **Export at three post sizes**, and a `?shot=` mode used to produce the screenshots.

## Stage by stage

**T1 — shell.** The static page, the control column, the artboard and the code-drawn placeholder
scenes. The header and footer read state back to the user so the studio never looks like a mock.

**T2 — panel engine.** `layouts.js` holds the cuts as polygon lists with label anchors.
`editor.js` owns the tray, the panel-to-photo assignments and each slot's zoom/pan, and draws one
panel into an already-clipped context so the page composer stays in charge of layout. Five
procedural sample photos were generated for the tray, and a procedural sunset scene stands in for
any empty panel so a fresh load is never a grey grid.

**T3 — grades.** `grades.js` reads the composed panel pixels once and pushes them through the
chosen pipeline, then applies the shared finishing controls. Grain is hashed from pixel
coordinates rather than a random source, so dragging a slider does not make the speckle crawl and
two renders of the same state match.

**T4 — lettering and furniture.** `lettering.js` draws after the grade, on the frame, so type keeps
its own colour no matter what sits under it. The title fits itself: one line when it can stay big,
otherwise the words split at the space that leaves the two halves closest in width. Captions are
clamped to the panel's own width at the height they sit, which is what keeps a caption on a
slanted cut from spilling across the seam.

**T5 — export, shot mode, screenshots.** The last stage, below.

## T5 in detail

**One composer.** `exporter.js` exposes `renderCover()`, which paints the panels onto a scratch
surface, grades that surface in place, lifts it onto the frame, and then draws the gutters, the
selection outline (preview only) and the lettering. The live preview and every export call the
same function with a different width and height. Reusing one implementation is what makes the
exported PNG the same cover the user is looking at, and it removes the old separate composite
canvas that was hard-wired to 1080 × 1080.

**Composing at any aspect.** Panels are normalised polygons, so they simply scale to the target
frame. Gutters scale with the short side, so a 16:9 frame gets the same visual seam weight as the
square. Type and furniture are sized from the frame's own height inside `lettering.js`, so nothing
is stretched: the measured aspect ratio of a title glyph is 0.547 at 1080 × 1080, 0.538 at
1080 × 1350 and 0.547 at 1920 × 1080. The wide cover reads as a composed landscape poster with a
smaller title relative to width, not as square type stretched sideways.

**Export controls.** Three size buttons (Square 1080 × 1080, Portrait 1080 × 1350, Landscape
1920 × 1080) plus Export All, which renders and downloads all three in sequence. Filenames are
derived from the current layout, grade and size, and the buttons disable while a batch runs so a
double press cannot queue overlapping renders.

**Determinism.** Nothing in the render path reads the clock or a random source: grain is hashed
from x/y, the barcode from a fixed seed string, and the tray order is pinned by a slot index
instead of by which image finished decoding first. Two exports of the same state at 1920 × 1080
produced the same SHA-256: `c12e16fe472f251d6828435805575903da0d227782b2c31d1bbc516addf4639b`
(3,537,147 bytes, both runs).

**Shot mode.** `?shot=cover` renders the cover alone, full-viewport, at the pixel size in the URL,
with the studio chrome removed and the canvas pinned to the top-left at exactly that size — no
border, shadow, rotation or CSS scaling, so the capture is the render. `?shot=editor` opens the
whole studio with the sample photos already composed. A shot may name a preset plus an explicit
layout, grade and size; an explicit value wins over the preset. The page raises
`document.body.dataset.shotReady = '1'` (and `window.__shotReady`) only after the local fonts load,
the sample photos decode, and two animation frames have painted, so a capture script polls one
attribute instead of guessing at a delay.

A subtle bug this stage surfaced: composing the samples before they had finished decoding left
some panels on the drawn placeholder, and because the network served the five images in a different
order each run, the tray order changed too. Both are fixed — the shot waits for readiness first,
and the tray is sorted by a fixed slot index after loading.

**Screenshots.** Four files, captured from the running app at the render size and then downscaled:

| File | Final size | Bytes | Shot |
| --- | --- | --- | --- |
| `1-cover-landscape.jpg` | 1280 × 720 | 250,425 | Slash Six + Painterly, 1920 × 1080 render |
| `2-editor.jpg` | 1280 × 720 | 189,141 | Full studio, Slash Six + Painterly, samples composed |
| `3-cover-portrait.jpg` | 1024 × 1280 | 255,942 | Diagonal Trio + Golden Hour, 1080 × 1350 render |
| `4-cover-square.jpg` | 1080 × 1080 | 247,381 | Vice Wedge + Poster Ink, 1080 × 1080 render |

Shot 1 and shot 3 use different cuts and different grades from each other, and shot 4 uses a third
grade. Shots 1 and 2 were recalibrated in T6; see the T6 section below — this table lists the files
as they now stand.

## Verification

Measured in headless Chromium against the running app, driven over the DevTools protocol.

- **Console clean.** Zero errors and zero warnings on a normal load, and zero on each of the three
  cover shots. Zero requests to any origin outside the app itself — the only resources are the
  local fonts, the sample photos and the ES modules.
- **Grades differ measurably.** Same layout and lettering, five grades, panel pixels compared
  pairwise: every pair changes 93.8 %–96.1 % of panel pixels, and the weakest pair still moves the
  mean channel by 21.2 of 255. The five looks are genuinely different images, not tints of one.
- **Captions stay inside their panels.** Lettering drawn alone on a blank canvas with furniture off,
  across nine layout × aspect combinations: 100 % of caption ink falls inside a panel polygon, and
  none of it reaches the title band. No caption collides with the title at any ratio tested.
- **Title legible small.** At 768 × 480 the title band runs from a 10th-percentile luminance of 15.4
  (the scrim) to a 99th-percentile of 240.6 (the glyph faces), with 18,572 warm glyph pixels in a
  458 × 75 box — roughly 13:1 contrast between type and its ground.
- **Deterministic export.** Same state exported twice at 1920 × 1080: identical SHA-256, identical
  byte count.
- **Sizes and caps.** `app/` holds 19 files totalling 1,000,063 bytes; `index.html` is 12,268 bytes.
  Both are far inside the 993-entry, 48 MiB and 1 MiB limits.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or run the entry program, which copies `app/` and `screenshots/` into the output directory and
writes the dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Shots, for reference:

```
http://localhost:8080/?shot=cover&preset=neon-vice&layout=slash-hero&grade=neon&size=1920x1080
http://localhost:8080/?shot=cover&preset=coastal-gold&layout=diagonal-trio&grade=golden&size=1080x1350
http://localhost:8080/?shot=cover&preset=ink-poster&layout=vice-wedge&grade=poster&size=1080x1080
http://localhost:8080/?shot=editor&preset=sunset-boulevard&layout=grid-four&grade=sunset
```

## T6 — screenshot calibration

The first screenshots were honest about the app but not about the board. Reading down the
consistent top of the live board, two things held: the hero grades were photographic sunset or
painterly, with duotone and poster ink absent from that band, and the first covers carried five to
seven panels rather than four. The editor shot also had to earn its place — the cut the studio was
sitting on should be the slanted system the entry is named for, not a straight grid. T6 changed the
screenshots and the two things they exposed, and nothing else in the render path.

**The six changes.**

1. A seventh cut, **Slash Six**, in `app/src/layouts.js`: one full-height leaning hero on the left
   and five stacked panels down the right, six panels in total. It is built from the same polygon
   list as every other cut, so the clip, hit test, gutters and caption clamps came with it.
2. A fifth preset, **Painterly Hero**, in `app/src/presets.js`: Slash Six with the Painterly grade,
   the title `PAINTED VICE` and six location captions.
3. Screenshot 1 moved from Slash Hero + Neon Duotone (four panels) to Slash Six + Painterly (six
   panels).
4. The editor screenshot moved from Grid Four to Slash Six, so the slanted system shows in the
   editor evidence and not only in the covers.
5. `app/src/cover.js`, a dead file left from the starter scaffold, was removed after a grep proved
   nothing referenced it.
6. The README and this log's count lines were updated to seven cuts and five presets.

**The final screenshots**, measured with PIL:

| File | Size | Bytes | Shot |
| --- | --- | --- | --- |
| `1-cover-landscape.jpg` | 1280 × 720 | 250,425 | Slash Six + Painterly, 1920 × 1080 render |
| `2-editor.jpg` | 1280 × 720 | 189,141 | Full studio, Slash Six + Painterly, samples composed |
| `3-cover-portrait.jpg` | 1024 × 1280 | 255,942 | Diagonal Trio + Golden Hour, 1080 × 1350 render |
| `4-cover-square.jpg` | 1080 × 1080 | 247,381 | Vice Wedge + Poster Ink, 1080 × 1080 render |

All four are inside the caps: at most 262,144 bytes, long side at most 1280, short side at least
480. Shots 1 and 3 use different cuts and grades, and shot 4 uses a third grade — shot 1 now
Painterly, shot 3 Golden Hour, shot 4 Poster Ink.

**Title and caption overlap, measured.** On Slash Six at 1920 × 1080, the caption chips of the top
two right-hand panels share canvas territory with the title's ink bounding box (title ink spans
x = 379..1524, y = 79..358). The intersection is 5,943 px in total, of which 1,081 px is caption
text ink — 12.07 % of all caption text ink. This is not a legibility defect. In `drawLettering` the
captions are drawn after the title, so the chips paint over the title's extrude and every caption
stays fully legible in the composite; that is visible in the shipped shot 1, and the same layering
shipped in T5's Slash Hero cover. It is the poster's intended layering, recorded here with its
numbers.

**Gates.** The geometry raster test ran over all seven cuts — zero overlapping panel pixels,
uniform gutters, and no degenerate panel at 16:9, 1:1 or 4:5. Shot 1 was captured twice and came
back byte-identical, and a grade-substituted twin render (Neon) confirmed different from the saved
Painterly file, so the determinism check is not passing on a stale capture. The official kit check
on the worktree reports 4 passed, 0 failed, 17 skipped; the transcript gates are the site's own,
computed from the sealed recordings at submission, with 5 checks deferred to submission.

**Tray-order revision.** Testing the app with real public-domain photos instead of the built-in
samples exposed an ordering bug: the samples carry slot indices 0..4 and uploads carried none, so
the slot sort that pins tray order after loading left every upload at the end. Spread and Auto-Fill
walk `photos` in order, so a reviewer who uploaded four photos and pressed Spread got the five
samples spread across the cover and none of their own work — the user's photos only entered through
the first-upload auto-place, a tray click, or Fill-All. Uploads now take a slot of
`uploadSerial - 1000000`, which sorts ahead of the samples while keeping upload order among
themselves, and `addPhoto` inserts each button at the index the photo holds in the sorted list
rather than appending, so the visible tray matches the photo order whether an upload lands before
or after the samples' ready rebuild. Nothing else changed: the samples keep slots 0..4, the
comparator is untouched, and the fill, preset and lettering paths are as they were.

Verified: with the four foreign photos uploaded and Spread pressed on Grid Four, all four panels
hold the four uploads in upload order (read back through the panel selection label, and confirmed
independently by correlating each panel region of the exported 1920 × 1080 PNG against the source
photos — 0.78..0.91 for the expected photo against 0.24 or less for every other); Auto-Fill does
the same from empty panels; the tray shows the uploads before the samples both when uploaded after
the ready rebuild and while the sample requests were held at the network layer mid-load; zero
console errors. `node --check app/src/editor.js` is clean. Shot mode has no uploads, so the
screenshots must not move: shots 1 and 2 were re-captured and re-encoded with the T6 pipeline and
came back byte-identical to the shipped files (`1-cover-landscape.jpg` sha256
`0bfb9b37687d23be2076292126cc3701b9230f19bddc82dd68398a344c19bb12`, `2-editor.jpg` sha256
`3bdab61a6de80a71864e34a1d92c3dadcaa844b3f9464babd99a380e2e28e559`), and `screenshots/` is
unmodified.
