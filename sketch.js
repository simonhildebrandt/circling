const CELL_SIZE = 160;
const SCROLL_SPEED = 10; // pixels per second
const ARC_SPEED = 0.5; // progress per second (0..1 over the quarter arc)
const MAX_WORMS = 60;
const SPAWN_CHANCE_PER_SEC = 100; // expected spawn attempts per second
const CONTINUE_CHANCE = 0.8;
const STROKE_WEIGHT = 32;
const ARC_OPACITY = 90; // 0-255, low-opacity black drawn over the squares

const COG_CHANCE = 0.2; // probability a grid intersection gets a cog
const COG_SIZE = CELL_SIZE * 0.3;
const COG_TEETH = 10;

const AUTUMN_PALETTE = [
  [174, 96, 37], // terracotta
  [169, 85, 31], // clay
  [151, 107, 47], // muted olive gold
  [151, 72, 41], // dusty rust
  [164, 115, 49], // warm sand
  [136, 87, 49], // taupe brown
  [160, 95, 24], // amber clay
  [151, 78, 54], // faded chestnut
];

const WALLS = ["N", "E", "S", "W"];
const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };
const PERPENDICULAR = {
  N: ["E", "W"],
  S: ["E", "W"],
  E: ["N", "S"],
  W: ["N", "S"],
};

// Each unordered wall pair maps to the grid-cell corner the arc is centered
// on, and the angle (radians, clockwise from +x) at which that arc meets
// each of the two walls.
const ARC_GEOMETRY = {
  "E,N": { corner: [1, 0], angles: { E: Math.PI / 2, N: Math.PI } },
  "E,S": { corner: [1, 1], angles: { S: Math.PI, E: (3 * Math.PI) / 2 } },
  "S,W": { corner: [0, 1], angles: { W: (3 * Math.PI) / 2, S: 2 * Math.PI } },
  "N,W": { corner: [0, 0], angles: { N: 0, W: Math.PI / 2 } },
};

function arcGeometryFor(wallA, wallB) {
  const key = [wallA, wallB].sort().join(",");
  return ARC_GEOMETRY[key];
}

function randomWall() {
  return WALLS[Math.floor(Math.random() * WALLS.length)];
}

function randomAutumnColor() {
  return AUTUMN_PALETTE[Math.floor(Math.random() * AUTUMN_PALETTE.length)];
}

function makeCell() {
  return { segments: [], color: randomAutumnColor() };
}

function maybeMakeCog() {
  if (Math.random() > COG_CHANCE) return null;
  return { rotation: Math.random() * Math.PI * 2 };
}

const sketch = (p) => {
  let cols;
  let rows; // ring buffer of row objects, always in current top-to-bottom order
  let scrollOffset = 0;

  function buildGrid() {
    cols = Math.max(1, Math.floor(p.width / CELL_SIZE));
    const visibleRows = Math.ceil(p.height / CELL_SIZE);
    const rowCount = visibleRows + 1; // extra buffer row below the screen
    rows = [];
    for (let r = 0; r < rowCount; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) cells.push(makeCell());
      const intersections = [];
      for (let c = 0; c <= cols; c++) intersections.push(maybeMakeCog());
      rows.push({ cells, intersections });
    }
    scrollOffset = 0;
  }

  function neighborOf(rowIdx, col, wall) {
    if (wall === "N") {
      const r = (rowIdx - 1 + rows.length) % rows.length;
      return { rowIdx: r, col };
    }
    if (wall === "S") {
      const r = (rowIdx + 1) % rows.length;
      return { rowIdx: r, col };
    }
    if (wall === "E") {
      const c = col + 1;
      return c < cols ? { rowIdx, col: c } : null;
    }
    // W
    const c = col - 1;
    return c >= 0 ? { rowIdx, col: c } : null;
  }

  function spawnWorm(rowIdx, col, forcedEntryWall) {
    const entryWall = forcedEntryWall || randomWall();
    const perp = PERPENDICULAR[entryWall];
    const exitWall = perp[Math.floor(Math.random() * perp.length)];
    rows[rowIdx].cells[col].segments.push({
      entryWall,
      exitWall,
      head: 0,
      tail: 0,
      state: "growing",
    });
  }

  function countActiveWorms() {
    let n = 0;
    for (const row of rows) {
      for (const cell of row.cells) n += cell.segments.length;
    }
    return n;
  }

  function updateWorms(dt) {
    // Snapshot cells so newly spawned segments (from continuations) don't
    // get updated again in the same frame.
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const cells = rows[rowIdx].cells;
      for (let col = 0; col < cells.length; col++) {
        const segments = cells[col].segments;
        for (let i = segments.length - 1; i >= 0; i--) {
          const seg = segments[i];
          if (seg.state === "growing") {
            seg.head += ARC_SPEED * dt;
            if (seg.head >= 1) {
              seg.head = 1;
              seg.state = "shrinking";

              const continues = Math.random() < CONTINUE_CHANCE;
              const target = continues
                ? neighborOf(rowIdx, col, seg.exitWall)
                : null;
              if (target) {
                spawnWorm(target.rowIdx, target.col, OPPOSITE[seg.exitWall]);
              }
            }
          } else {
            seg.tail += ARC_SPEED * dt;
            if (seg.tail >= 1) {
              segments.splice(i, 1);
            }
          }
        }
      }
    }
  }

  function maybeSpawnNew(dt) {
    if (countActiveWorms() >= MAX_WORMS) return;
    if (Math.random() < SPAWN_CHANCE_PER_SEC * dt) {
      const rowIdx = Math.floor(Math.random() * rows.length);
      const col = Math.floor(Math.random() * cols);
      if (rows[rowIdx].cells[col].segments.length === 0) {
        spawnWorm(rowIdx, col);
      }
    }
  }

  function scroll(dt) {
    scrollOffset += SCROLL_SPEED * dt;
    while (scrollOffset >= CELL_SIZE) {
      scrollOffset -= CELL_SIZE;
      const recycled = rows.shift();
      for (const cell of recycled.cells) {
        cell.segments = [];
        cell.color = randomAutumnColor();
      }
      for (let c = 0; c < recycled.intersections.length; c++) {
        recycled.intersections[c] = maybeMakeCog();
      }
      rows.push(recycled);
    }
  }

  function drawGrid() {
    p.noStroke();
    // scrollOffset lands on a sub-pixel value most frames, so row edges get
    // antialiased against the background. Overlap each rect by a pixel so
    // the next row (drawn after) fully covers that seam instead of letting
    // the background show through and shimmer as the offset changes.
    const overlap = 1;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const y = rowIdx * CELL_SIZE - scrollOffset;
      for (let col = 0; col < cols; col++) {
        const x = col * CELL_SIZE;
        const cell = rows[rowIdx].cells[col];
        p.fill(cell.color[0], cell.color[1], cell.color[2]);
        p.rect(x, y, CELL_SIZE + overlap, CELL_SIZE + overlap);
      }
    }
  }

  function drawArcs() {
    p.stroke(0, 0, 0, ARC_OPACITY);
    p.strokeWeight(STROKE_WEIGHT);
    p.strokeCap(p.SQUARE);
    p.noFill();
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const y = rowIdx * CELL_SIZE - scrollOffset;
      for (let col = 0; col < cols; col++) {
        const x = col * CELL_SIZE;
        const cell = rows[rowIdx].cells[col];
        for (const seg of cell.segments) {
          drawSegment(x, y, seg);
        }
      }
    }
  }

  function drawSegment(x, y, seg) {
    const geo = arcGeometryFor(seg.entryWall, seg.exitWall);
    const entryAngle = geo.angles[seg.entryWall];
    const exitAngle = geo.angles[seg.exitWall];
    const a1 = p.lerp(entryAngle, exitAngle, seg.tail);
    const a2 = p.lerp(entryAngle, exitAngle, seg.head);
    const startAngle = Math.min(a1, a2);
    const stopAngle = Math.max(a1, a2);
    if (stopAngle - startAngle < 0.001) return;

    const cx = x + geo.corner[0] * CELL_SIZE;
    const cy = y + geo.corner[1] * CELL_SIZE;
    const diameter = CELL_SIZE;
    p.arc(cx, cy, diameter, diameter, startAngle, stopAngle);
  }

  function drawCogs() {
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const y = rowIdx * CELL_SIZE - scrollOffset;
      const intersections = rows[rowIdx].intersections;
      for (let col = 0; col <= cols; col++) {
        const cog = intersections[col];
        if (cog) drawCog(col * CELL_SIZE, y, cog);
      }
    }
  }

  function drawCog(x, y, cog) {
    const outerR = COG_SIZE;
    const innerR = outerR * 0.7;
    const holeR = outerR * 0.32;

    p.push();
    p.translate(x, y);
    p.rotate(cog.rotation);

    p.noStroke();
    p.fill(0, 0, 0, ARC_OPACITY);
    p.beginShape();
    const anglePerTooth = (Math.PI * 2) / COG_TEETH;
    // Tooth is wide at its base (inner radius) and narrows toward its tip
    // (outer radius), so the gap is small at the base and large at the tip.
    const outerToothWidth = anglePerTooth * 0.2;
    const innerToothWidth = anglePerTooth * 0.8;
    for (let i = 0; i < COG_TEETH; i++) {
      const center = i * anglePerTooth + anglePerTooth / 2;
      const innerLeft = center - innerToothWidth / 2;
      const outerLeft = center - outerToothWidth / 2;
      const outerRight = center + outerToothWidth / 2;
      const innerRight = center + innerToothWidth / 2;
      p.vertex(innerR * Math.cos(innerLeft), innerR * Math.sin(innerLeft));
      p.vertex(outerR * Math.cos(outerLeft), outerR * Math.sin(outerLeft));
      p.vertex(outerR * Math.cos(outerRight), outerR * Math.sin(outerRight));
      p.vertex(innerR * Math.cos(innerRight), innerR * Math.sin(innerRight));
    }

    // Cut the center hole directly out of the gear shape (opposite winding
    // direction from the outer path) so the square beneath actually shows
    // through, rather than erasing down to the page background.
    p.beginContour();
    const holeSegments = 24;
    for (let i = 0; i <= holeSegments; i++) {
      const a = -(i / holeSegments) * Math.PI * 2;
      p.vertex(holeR * Math.cos(a), holeR * Math.sin(a));
    }
    p.endContour();

    p.endShape(p.CLOSE);

    p.pop();
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.frameRate(60);
    buildGrid();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    buildGrid();
  };

  p.draw = () => {
    const dt = p.deltaTime / 1000;
    p.background(10);

    scroll(dt);
    maybeSpawnNew(dt);
    updateWorms(dt);

    drawGrid();
    drawArcs();
    drawCogs();
  };
};

new p5(sketch);
