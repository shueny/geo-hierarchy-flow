import { describe, expect, test } from "vitest";
import { canPlace, defaultLayout, footprint, moveRack, rackRect, restoreLayout, rotateRack, ROW_LEN } from "../components/hallLayout";

const ids = (n) => Array.from({ length: n }, (_, i) => `R${i + 1}`);
const allValid = (layout) => Object.entries(layout.racks).every(([id, p]) => canPlace(layout, id, p));

describe("defaultLayout", () => {
  test.each([1, 6, 7, 12, 14])("%i racks: every rack is placed, inside the room, without overlaps", (n) => {
    const l = defaultLayout(ids(n));
    expect(Object.keys(l.racks)).toHaveLength(n);
    expect(allValid(l)).toBe(true);
  });

  test("paired rows face each other across a cold aisle", () => {
    const l = defaultLayout(ids(12));
    expect(l.racks.R1.rot).toBe(0); // row 1 faces +z
    expect(l.racks[`R${ROW_LEN + 1}`].rot).toBe(2); // row 2 faces -z
    const aisle = l.coldAisles[0];
    expect(aisle.z).toBe(rackRect(l.racks.R1).z + 2); // starts right in front of row 1
    expect(rackRect(l.racks[`R${ROW_LEN + 1}`]).z).toBe(aisle.z + aisle.d); // row 2 starts after it
  });

  test("cable trays follow the planned rows and survive rack moves", () => {
    const l = defaultLayout(ids(7)); // a full row + a row with one rack
    expect(l.trays).toEqual([
      { x: 4, z: l.racks.R1.z, w: 6, d: 2 },
      { x: 4, z: l.racks.R7.z, w: 1, d: 2 },
    ]);
    const moved = moveRack(l, "R1", { x: 4, z: l.depth - 2, rot: 0 });
    expect(moved.trays).toBe(l.trays);
    expect(restoreLayout(l, { R1: { x: 4, z: l.depth - 2, rot: 0 } }).trays).toBe(l.trays);
  });

  test("has cooling units and one PDU per row", () => {
    const l = defaultLayout(ids(14));
    expect(l.fixtures.filter((f) => f.kind === "crac").length).toBeGreaterThan(0);
    expect(l.fixtures.filter((f) => f.kind === "pdu")).toHaveLength(3);
  });
});

describe("moving racks", () => {
  const l = defaultLayout(ids(12));

  test("footprint swaps width and depth when rotated a quarter turn", () => {
    expect(footprint(0)).toEqual({ w: 1, d: 2 });
    expect(footprint(1)).toEqual({ w: 2, d: 1 });
  });

  test("can move into free floor", () => {
    const next = moveRack(l, "R1", { x: 4, z: l.depth - 2, rot: 0 });
    expect(next.racks.R1).toEqual({ x: 4, z: l.depth - 2, rot: 0 });
    expect(l.racks.R1).not.toEqual(next.racks.R1); // original untouched
  });

  test("cannot overlap another rack", () => {
    expect(moveRack(l, "R1", { ...l.racks.R2 })).toBeNull();
  });

  test("cannot overlap fixed equipment (CRAC, PDU)", () => {
    const crac = l.fixtures.find((f) => f.kind === "crac");
    const pdu = l.fixtures.find((f) => f.kind === "pdu");
    expect(moveRack(l, "R1", { x: crac.x, z: crac.z, rot: 0 })).toBeNull();
    expect(moveRack(l, "R1", { x: pdu.x, z: pdu.z, rot: 0 })).toBeNull();
  });

  test("cannot leave the room on any side", () => {
    expect(moveRack(l, "R1", { x: -1, z: 0, rot: 0 })).toBeNull();
    expect(moveRack(l, "R1", { x: 0, z: -1, rot: 0 })).toBeNull();
    expect(moveRack(l, "R1", { x: l.width - 1, z: l.depth - 1, rot: 0 })).toBeNull(); // 2 deep → sticks out
    expect(moveRack(l, "R1", { x: l.width - 1, z: l.depth - 2, rot: 0 })).not.toBeNull(); // fits exactly
  });

  test("moving onto its own spot is allowed (no self-collision)", () => {
    expect(moveRack(l, "R1", { ...l.racks.R1 })).not.toBeNull();
  });

  test("rotation is blocked when the turned footprint hits a neighbour", () => {
    expect(rotateRack(l, "R1")).toBeNull(); // R2 is right next to it
    const moved = moveRack(l, "R1", { x: 4, z: l.depth - 2, rot: 0 });
    // in the open the 2×1 footprint fits once there is room to the right
    const free = moveRack(moved, "R1", { x: l.width - 3, z: l.depth - 2, rot: 0 });
    expect(rotateRack(free, "R1").racks.R1.rot).toBe(1);
  });
});

describe("restoreLayout", () => {
  const base = defaultLayout(ids(6));

  test("restores a swap of two racks (applied as a set, not one by one)", () => {
    const saved = { R1: base.racks.R2, R2: base.racks.R1 };
    const out = restoreLayout(base, saved);
    expect(out.racks.R1).toEqual(base.racks.R2);
    expect(out.racks.R2).toEqual(base.racks.R1);
  });

  test("falls back to the default when the saved set collides", () => {
    expect(restoreLayout(base, { R1: base.racks.R2 })).toBe(base);
  });

  test("ignores unknown racks, garbage and missing data", () => {
    expect(restoreLayout(base, null)).toBe(base);
    expect(restoreLayout(base, "x")).toBe(base);
    expect(restoreLayout(base, { NOPE: { x: 1, z: 1, rot: 0 }, R1: { x: "a" } }).racks).toEqual(base.racks);
  });

  test("normalises rotation and rounds positions", () => {
    const out = restoreLayout(base, { R1: { x: 4.2, z: base.depth - 2.1, rot: -2 } });
    expect(out.racks.R1).toEqual({ x: 4, z: base.depth - 2, rot: 2 });
  });
});
