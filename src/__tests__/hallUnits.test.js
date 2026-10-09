import { describe, expect, test } from "vitest";
import { Ray, Vector3 } from "three";
import { TILE } from "../components/hallLayout";
import { RACK_H, cameraPreset, rackTransform, rayToTile, roomFrame } from "../components/hall3d/units";

const frame = roomFrame({ width: 15, depth: 20 });

describe("roomFrame / rackTransform", () => {
  test("the room is centred on the origin", () => {
    expect(frame.wx(0)).toBeCloseTo(-frame.W / 2);
    expect(frame.wx(15)).toBeCloseTo(frame.W / 2);
    expect(frame.wz(10)).toBeCloseTo(0);
  });

  test("a rack's world centre is the middle of its footprint, and rotation is a quarter turn per step", () => {
    const a = rackTransform({ x: 4, z: 3, rot: 0 }, frame); // 1 × 2 tiles
    expect(a.x).toBeCloseTo(frame.wx(4) + TILE / 2);
    expect(a.z).toBeCloseTo(frame.wz(3) + TILE);
    const b = rackTransform({ x: 4, z: 3, rot: 1 }, frame); // 2 × 1 tiles
    expect(b.x).toBeCloseTo(frame.wx(4) + TILE);
    expect(b.z).toBeCloseTo(frame.wz(3) + TILE / 2);
    expect(b.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe("rayToTile — the drag maths", () => {
  const down = (x, z) => new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0));

  test("a ray straight down lands on the tile under it", () => {
    const t = rayToTile(down(frame.wx(6.5), frame.wz(8.25)), frame);
    expect(t.x).toBeCloseTo(6.5);
    expect(t.z).toBeCloseTo(8.25);
  });

  test("it intersects at rack-top height, so an oblique ray is NOT the same as hitting the floor", () => {
    // from (0, 10, 0) towards a floor point 4 m away in x: at y = RACK_H the ray is still short of that point
    const dir = new Vector3(4, -10, 0).normalize();
    const t = rayToTile(new Ray(new Vector3(0, 10, 0), dir), frame);
    const xAtTop = (10 - RACK_H) * (4 / 10); // 3.2 m
    expect(t.x).toBeCloseTo((xAtTop + frame.W / 2) / TILE);
  });

  test("rays that never reach the plane give null", () => {
    expect(rayToTile(new Ray(new Vector3(0, 10, 0), new Vector3(0, 0, 1)), frame)).toBeNull(); // parallel
    expect(rayToTile(new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0)), frame)).toBeNull(); // pointing away
  });
});

describe("cameraPreset", () => {
  test("top view looks straight down at the room centre; the 3D view is above and in front", () => {
    const top = cameraPreset("top", frame);
    expect(top.pos.x).toBe(0);
    expect(top.pos.y).toBeGreaterThan(Math.max(frame.W, frame.D));
    const p = cameraPreset("perspective", frame);
    expect(p.pos.y).toBeGreaterThan(0);
    expect(p.pos.z).toBeGreaterThan(0);
  });
});
