import { describe, expect, test } from "vitest";
import { buildGraph, NODE_W, NODE_H, RACK_COLS } from "../components/hierarchyLayout";
import { COUNTRIES, ALL_SITES, countRacks } from "../data/sites";

const overlaps = (a, b) => {
  const wa = NODE_W[a.data.kind];
  const wb = NODE_W[b.data.kind];
  const ha = NODE_H[a.data.kind];
  const hb = NODE_H[b.data.kind];
  return a.position.x < b.position.x + wb && b.position.x < a.position.x + wa
    && a.position.y < b.position.y + hb && b.position.y < a.position.y + ha;
};

const anyOverlap = (nodes) =>
  nodes.some((a, i) => nodes.slice(i + 1).some((b) => overlaps(a, b)));

describe("buildGraph — single site", () => {
  const site = ALL_SITES.find((s) => s.id === "TPE1");
  const { nodes, edges } = buildGraph({ site, depth: 2 });

  test("one node per site, hall and rack", () => {
    expect(nodes).toHaveLength(1 + site.rooms.length + countRacks(site));
  });

  test("edges connect site → halls only; racks are placed in a grid without edges", () => {
    expect(edges).toHaveLength(site.rooms.length);
    expect(edges.every((e) => e.source === site.id)).toBe(true);
  });

  test("racks wrap into rows of at most RACK_COLS", () => {
    const hall = site.rooms[0];
    const ys = new Set(nodes.filter((n) => hall.racks.some((r) => r.id === n.id)).map((n) => n.position.y));
    expect(ys.size).toBe(Math.ceil(hall.racks.length / RACK_COLS));
  });

  test("no two nodes overlap", () => {
    expect(anyOverlap(nodes)).toBe(false);
  });

  test("depth 1 stops at halls", () => {
    expect(buildGraph({ site, depth: 1 }).nodes).toHaveLength(1 + site.rooms.length);
  });
});

describe("buildGraph — global tree", () => {
  const { nodes, edges } = buildGraph({ countries: COUNTRIES, depth: 1 });

  test("countries, sites and halls are all present and nothing overlaps", () => {
    const halls = ALL_SITES.reduce((n, s) => n + s.rooms.length, 0);
    expect(nodes).toHaveLength(COUNTRIES.length + ALL_SITES.length + halls);
    expect(anyOverlap(nodes)).toBe(false);
  });

  test("every non-root node has exactly one parent edge", () => {
    const targets = edges.map((e) => e.target);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).toHaveLength(nodes.length - COUNTRIES.length);
  });

  test("node ids are unique (React Flow needs that)", () => {
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  });
});
