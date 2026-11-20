// Panel geometry for the Slash Vice cover. Every panel is a closed polygon in normalized
// 0..1 cover space, listed clockwise, so the same data drives the canvas clip, the hit test
// and the black gutters drawn between panels. Panels are separated by a 0.012 cover-unit gap;
// slanted layouts keep that gap measured perpendicular-ish to the cut so the seam never pinches.

const point = (x, y) => [x, y];

function panel(id, points, labelAnchor) {
  return { id, points, labelAnchor };
}

// The Slash Hero cut: one full-height hero on the left, three stacked panels on the right.
// The hero's right edge is the line x = 0.61 - 0.12y, and each right-hand panel starts a
// constant 0.012 to the right of that line at both of its corners.
const HERO_TOP = 0.61;
const HERO_SLANT = 0.12;
const HERO_GAP = 0.012;
const heroEdge = (y) => HERO_TOP - HERO_SLANT * y + HERO_GAP;

// Slash Six keeps that hero and the same right-hand offset, but stacks five stills instead of
// three. Five panels plus four 0.012 seams divide the full height, so every row is 0.1904 tall and
// its left corners sit exactly where Slash Hero's rows would: a constant 0.012 off the hero line.
const SIX_ROWS = 5;
const SIX_ROW_HEIGHT = (1 - (SIX_ROWS - 1) * HERO_GAP) / SIX_ROWS;
const SIX_ROW_STEP = SIX_ROW_HEIGHT + HERO_GAP;

function slashSixRow(index) {
  const top = index * SIX_ROW_STEP;
  const bottom = top + SIX_ROW_HEIGHT;
  const middle = (top + bottom) / 2;
  return panel(
    String.fromCharCode(98 + index),
    [point(heroEdge(top), top), point(1, top), point(1, bottom), point(heroEdge(bottom), bottom)],
    { x: (heroEdge(middle) + 1) / 2, y: middle },
  );
}

export const LAYOUTS = [
  {
    id: 'grid-four',
    name: 'Grid Four',
    family: 'Straight cuts',
    description: 'Four equal panels in a clean crime-scene grid.',
    panels: [
      panel('a', [point(0, 0), point(0.494, 0), point(0.494, 0.494), point(0, 0.494)], { x: 0.247, y: 0.247 }),
      panel('b', [point(0.506, 0), point(1, 0), point(1, 0.494), point(0.506, 0.494)], { x: 0.753, y: 0.247 }),
      panel('c', [point(0, 0.506), point(0.494, 0.506), point(0.494, 1), point(0, 1)], { x: 0.247, y: 0.753 }),
      panel('d', [point(0.506, 0.506), point(1, 0.506), point(1, 1), point(0.506, 1)], { x: 0.753, y: 0.753 }),
    ],
  },
  {
    id: 'hero-plus-three',
    name: 'Hero Plus Three',
    family: 'Straight cuts',
    description: 'A tall lead image with three supporting beats.',
    panels: [
      panel('a', [point(0, 0), point(0.61, 0), point(0.61, 1), point(0, 1)], { x: 0.305, y: 0.5 }),
      panel('b', [point(0.622, 0), point(1, 0), point(1, 0.326), point(0.622, 0.326)], { x: 0.811, y: 0.163 }),
      panel('c', [point(0.622, 0.338), point(1, 0.338), point(1, 0.662), point(0.622, 0.662)], { x: 0.811, y: 0.5 }),
      panel('d', [point(0.622, 0.674), point(1, 0.674), point(1, 1), point(0.622, 1)], { x: 0.811, y: 0.837 }),
    ],
  },
  {
    id: 'triple-strip',
    name: 'Triple Strip',
    family: 'Straight cuts',
    description: 'Three vertical strips, poster-style.',
    panels: [
      panel('a', [point(0, 0), point(0.326, 0), point(0.326, 1), point(0, 1)], { x: 0.163, y: 0.5 }),
      panel('b', [point(0.338, 0), point(0.662, 0), point(0.662, 1), point(0.338, 1)], { x: 0.5, y: 0.5 }),
      panel('c', [point(0.674, 0), point(1, 0), point(1, 1), point(0.674, 1)], { x: 0.837, y: 0.5 }),
    ],
  },
  {
    id: 'slash-hero',
    name: 'Slash Hero',
    family: 'Slanted cuts',
    description: 'The signature cut: a leaning hero beside three slanted stills.',
    panels: [
      panel('a', [point(0, 0), point(0.61, 0), point(0.49, 1), point(0, 1)], { x: 0.275, y: 0.5 }),
      panel(
        'b',
        [point(0.622, 0), point(1, 0), point(1, 0.326), point(heroEdge(0.326), 0.326)],
        { x: (heroEdge(0.326) + 1) / 2, y: 0.163 },
      ),
      panel(
        'c',
        [point(heroEdge(0.338), 0.338), point(1, 0.338), point(1, 0.662), point(heroEdge(0.662), 0.662)],
        { x: (heroEdge(0.5) + 1) / 2, y: 0.5 },
      ),
      panel(
        'd',
        [point(heroEdge(0.674), 0.674), point(1, 0.674), point(1, 1), point(0.502, 1)],
        { x: (heroEdge(0.837) + 1) / 2, y: 0.837 },
      ),
    ],
  },
  {
    id: 'slash-six',
    name: 'Slash Six',
    family: 'Slanted cuts',
    description: 'The leaning hero and a ladder of five stills down the right.',
    panels: [
      panel('a', [point(0, 0), point(HERO_TOP, 0), point(0.49, 1), point(0, 1)], { x: 0.275, y: 0.5 }),
      slashSixRow(0),
      slashSixRow(1),
      slashSixRow(2),
      slashSixRow(3),
      slashSixRow(4),
    ],
  },
  {
    id: 'diagonal-trio',
    name: 'Diagonal Trio',
    family: 'Slanted cuts',
    description: 'Three leaning columns that march across the page.',
    // Every edge leans by the same 0.19 across the full height, so the seams stay parallel.
    // A horizontal gap of 0.0122 on a lean this steep is a 0.012 gutter measured square-on.
    panels: [
      panel('a', [point(0, 0), point(0.39, 0), point(0.2, 1), point(0, 1)], { x: 0.1475, y: 0.5 }),
      panel('b', [point(0.4022, 0), point(0.72, 0), point(0.53, 1), point(0.2122, 1)], { x: 0.4661, y: 0.5 }),
      panel('c', [point(0.7322, 0), point(1, 0), point(1, 1), point(0.5422, 1)], { x: 0.8186, y: 0.5 }),
    ],
  },
  {
    id: 'vice-wedge',
    name: 'Vice Wedge',
    family: 'Slanted cuts',
    description: 'A hard diagonal band over one big wedge and a corner triangle.',
    // Two cuts at different angles: the shallow one needs a 0.0122 vertical offset and the
    // 45-degree one 0.017 to come out as the same 0.012 gutter.
    panels: [
      panel('a', [point(0, 0), point(1, 0), point(1, 0.34), point(0, 0.5)], { x: 0.5, y: 0.21 }),
      panel(
        'b',
        [point(0, 0.5122), point(1, 0.3522), point(1, 0.48), point(0.48, 1), point(0, 1)],
        { x: 0.36, y: 0.62 },
      ),
      panel('c', [point(1, 0.497), point(1, 1), point(0.497, 1)], { x: 0.8317, y: 0.8317 }),
    ],
  },
];

export function getLayout(layoutId) {
  const layout = LAYOUTS.find((candidate) => candidate.id === layoutId);
  if (!layout) throw new Error(`Unknown layout: ${layoutId}`);

  return {
    ...layout,
    panels: layout.panels.map((entry) => ({
      ...entry,
      points: entry.points.map(([x, y]) => [x, y]),
      labelAnchor: { ...entry.labelAnchor },
    })),
  };
}
