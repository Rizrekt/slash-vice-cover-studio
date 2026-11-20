# slash-vice-cover-studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Rizrekt/slash-vice-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Rizrekt/slash-vice-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Slash Vice is a browser-based cover-art workspace built around a simple idea: give everyday images the pacing and attitude of a crime-story poster. It composes straight and slanted photo panels, applies vivid colour treatments, and sets editable canvas typography over the top — without sending a user's photos to a server.

Seven panel cuts, a drag-to-reframe photo tray, five colour grades with strength, grain, vignette and halftone controls, fitted sunset-gradient lettering, per-panel location captions and a full set of poster furniture. Five one-press presets set the whole cover at once, and the finished artboard exports as a PNG at 1080 × 1080, 1080 × 1350 or 1920 × 1080 — the same state recomposed for each ratio rather than stretched.

## Features

- Slanted and straight panel cuts, defined once as normalised polygons and reused for clipping, hit-testing, gutters and captions.
- Local photo loading with per-panel zoom and pan; nothing is uploaded, and empty panels fall back to a drawn sunset scene.
- Five grade pipelines applied to the panel composite only, so lettering never picks up the grade.
- A fitted title, script subtitle, tracked tagline and one clamped caption per panel.
- Deterministic PNG export at three post sizes, plus Export All.
- Static local assets and vanilla JavaScript only, with no external services or libraries.

## Run it

Serve the app locally:

```sh
node serve.ts
```

Then open http://localhost:8080. To produce the entry output:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=t5qzbddk&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
