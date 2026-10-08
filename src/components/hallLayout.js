// Floor plan of one data hall, on a raised-floor grid of 600 mm tiles.
//
// Everything here is in tile units; the 3D scene multiplies by TILE (metres).
// A rack is 600 mm wide and 1200 mm deep → 1 × 2 tiles; rotated 90° it is 2 × 1.
// Positions are the rack's top-left tile (x along the width, z along the depth).
//
// The default layout is the usual hot/cold aisle arrangement: rows come in pairs
// whose fronts face each other across a perforated-tile cold aisle; backs face
// each other across a hot aisle. Cooling units (CRAC) line the left wall and a
// PDU sits at the end of every row.

export const TILE = 0.6; // metres
export const RACK_W = 1; // tiles, along the row
export const RACK_D = 2; // tiles, front to back
export const ROW_LEN = 6; // racks per row

const ROW_X0 = 4; // first rack column: CRAC units (2 tiles) + a 2-tile service aisle
const ROW_Z0 = 3; // first row: 3-tile entry aisle
const AISLE = 2; // cold and hot aisles are both 2 tiles (1.2 m)

// rotation: 0 = front faces +z, 1 = +x, 2 = -z, 3 = -x (quarter turns)
export const footprint = (rot) => (rot % 2 === 0 ? { w: RACK_W, d: RACK_D } : { w: RACK_D, d: RACK_W });

const rect = (x, z, w, d) => ({ x, z, w, d });
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

/**
 * Default floor plan for a hall with `rackIds` (in display order).
 * Returns { width, depth, racks: {id: {x, z, rot}}, fixtures: [...], coldAisles: [...] }.
 */
export const defaultLayout = (rackIds) => {
  const rows = Math.max(1, Math.ceil(rackIds.length / ROW_LEN));
  const pairs = Math.ceil(rows / 2);
  const rowZ = (r) => {
    const p = Math.floor(r / 2);
    const pairZ = ROW_Z0 + p * (RACK_D * 2 + AISLE * 2);
    // first row of a pair faces +z (into the cold aisle), second row faces -z
    return r % 2 === 0 ? pairZ : pairZ + RACK_D + AISLE;
  };

  const racks = {};
  rackIds.forEach((id, i) => {
    const r = Math.floor(i / ROW_LEN);
    racks[id] = { x: ROW_X0 + (i % ROW_LEN), z: rowZ(r), rot: r % 2 === 0 ? 0 : 2 };
  });

  const width = ROW_X0 + ROW_LEN + 1 /* PDU */ + 3;
  const depth = ROW_Z0 + pairs * (RACK_D * 2 + AISLE * 2) + 1;

  const fixtures = [];
  for (let r = 0; r < rows; r += 1) {
    fixtures.push({ id: `pdu-${r}`, kind: "pdu", ...rect(ROW_X0 + ROW_LEN, rowZ(r), 1, RACK_D) });
  }
  // one CRAC per 4 tiles of wall, starting after the entry aisle
  for (let z = ROW_Z0; z + 3 <= depth - 1; z += 4) {
    fixtures.push({ id: `crac-${z}`, kind: "crac", ...rect(0, z, 2, 3) });
  }

  const coldAisles = [];
  for (let p = 0; p < pairs; p += 1) {
    coldAisles.push(rect(ROW_X0, rowZ(p * 2) + RACK_D, ROW_LEN + 1, AISLE));
  }

  return { width, depth, racks, fixtures, coldAisles };
};

/** Rectangle a rack covers at a given position. */
export const rackRect = ({ x, z, rot }) => {
  const { w, d } = footprint(rot);
  return rect(x, z, w, d);
};

/**
 * Can rack `id` stand at `pos` ({x, z, rot})? It must stay inside the room and
 * not overlap any other rack or fixed equipment.
 */
export const canPlace = (layout, id, pos) => {
  const r = rackRect(pos);
  if (r.x < 0 || r.z < 0 || r.x + r.w > layout.width || r.z + r.d > layout.depth) return false;
  if (layout.fixtures.some((f) => overlaps(r, f))) return false;
  return Object.entries(layout.racks).every(([other, p]) => other === id || !overlaps(r, rackRect(p)));
};

/** Apply a move if it is valid; returns the new layout or null. */
export const moveRack = (layout, id, pos) =>
  canPlace(layout, id, pos) ? { ...layout, racks: { ...layout.racks, [id]: pos } } : null;

/** Quarter-turn a rack in place (around its top-left tile). Null if it would collide. */
export const rotateRack = (layout, id) => {
  const p = layout.racks[id];
  return moveRack(layout, id, { ...p, rot: (p.rot + 1) % 4 });
};

/**
 * Merge saved positions over a fresh default layout. The saved set is applied as a
 * whole (so two racks that swapped places restore correctly) and only kept if every
 * rack in it is valid; otherwise the default layout is used.
 */
export const restoreLayout = (base, saved) => {
  if (!saved || typeof saved !== "object") return base;
  const racks = { ...base.racks };
  Object.entries(saved).forEach(([id, pos]) => {
    if (!(id in racks) || !pos) return;
    const clean = { x: Math.round(pos.x), z: Math.round(pos.z), rot: ((Math.round(pos.rot) % 4) + 4) % 4 };
    if ([clean.x, clean.z, clean.rot].some(Number.isNaN)) return;
    racks[id] = clean;
  });
  const candidate = { ...base, racks };
  return Object.entries(racks).every(([id, pos]) => canPlace(candidate, id, pos)) ? candidate : base;
};
