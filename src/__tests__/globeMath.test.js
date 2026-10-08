import { describe, expect, test } from "vitest";
import { LON0, surfacePoint, unwrapRing, wrapPi } from "../components/globeMath";

const deg = (r) => (r * 180) / Math.PI;

describe("surfacePoint", () => {
  test("the map centre faces the camera (+z) on the globe and sits at the plane origin when flat", () => {
    const g = surfacePoint(0, deg(LON0), 0);
    expect(g.pos.x).toBeCloseTo(0);
    expect(g.pos.y).toBeCloseTo(0);
    expect(g.pos.z).toBeCloseTo(1);
    const f = surfacePoint(0, deg(LON0), 1);
    expect(f.pos.toArray().map((v) => +v.toFixed(6))).toEqual([0, 0, 1]);
  });

  test("globe points lie on the unit sphere; flat points lie on z = 1 with x = lon offset, y = lat", () => {
    const g = surfacePoint(35.65, 139.75, 0);
    expect(g.pos.length()).toBeCloseTo(1);
    const f = surfacePoint(35.65, 139.75, 1);
    expect(f.pos.z).toBeCloseTo(1);
    expect(f.pos.x).toBeCloseTo(((139.75 - deg(LON0)) * Math.PI) / 180);
    expect(f.pos.y).toBeCloseTo((35.65 * Math.PI) / 180);
  });

  test("points on the far side of the map centre wrap into [-π, π] instead of running off the plane", () => {
    // Ashburn is ~161° west of 121°E → should land on the left edge, not past +π
    const f = surfacePoint(39.04, -77.49, 1);
    expect(Math.abs(f.pos.x)).toBeLessThanOrEqual(Math.PI);
  });

  test("lift moves the point outward along the normal", () => {
    const a = surfacePoint(10, 100, 0);
    const b = surfacePoint(10, 100, 0, 0.1);
    expect(b.pos.length()).toBeCloseTo(a.pos.length() + 0.1);
  });

  test("mid-morph normals are unit length", () => {
    expect(surfacePoint(-33.87, 151.21, 0.5).normal.length()).toBeCloseTo(1);
  });
});

describe("wrapPi", () => {
  test.each([[0, 0], [Math.PI * 3, Math.PI], [-Math.PI * 1.5, Math.PI * 0.5]])("wrapPi(%f) = %f", (a, want) => {
    expect(wrapPi(a)).toBeCloseTo(want);
  });
});

describe("unwrapRing", () => {
  test("a ring crossing the antimeridian becomes continuous", () => {
    const out = unwrapRing([[179, 60], [-179, 60], [-178, 61], [178, 61]]);
    expect(out.map(([x]) => x)).toEqual([179, 181, 182, 178]);
  });

  test("a ring that doesn't cross is left alone", () => {
    const ring = [[120, 22], [122, 22], [121, 25]];
    expect(unwrapRing(ring)).toEqual(ring);
  });
});
