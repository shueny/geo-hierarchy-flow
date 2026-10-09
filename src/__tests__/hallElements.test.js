import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { ELEMENTS } from "../components/hall3d/elements";

const dir = join(__dirname, "..", "components");
const sceneFiles = [
  join(dir, "HallScene.jsx"),
  ...readdirSync(join(dir, "hall3d")).filter((f) => f.endsWith(".jsx") && f !== "SlimCanvas.jsx").map((f) => join(dir, "hall3d", f)),
];

// JSX tags that start with a lowercase letter and name a three.js class (mesh → Mesh, boxGeometry → BoxGeometry)
const threeTags = (src) => [...new Set([...src.matchAll(/<([a-z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))]
  .filter((tag) => tag[0].toUpperCase() + tag.slice(1) in THREE);

describe("R3F element registry (hall3d/elements.js)", () => {
  test("every three.js element the scene uses in JSX is registered — otherwise it only fails once rendered", () => {
    const used = new Set(sceneFiles.flatMap((f) => threeTags(readFileSync(f, "utf8"))));
    expect(used.size).toBeGreaterThan(5); // the scan itself works
    const missing = [...used].filter((tag) => !(tag[0].toUpperCase() + tag.slice(1) in ELEMENTS));
    expect(missing).toEqual([]);
  });

  test("ColorManagement is registered: R3F reads it from the registry, and without it every JSX colour renders too dark", () => {
    expect(ELEMENTS.ColorManagement).toBe(THREE.ColorManagement);
  });

  test("nothing registered is unused (keeps the bundle honest)", () => {
    const used = new Set(sceneFiles.flatMap((f) => threeTags(readFileSync(f, "utf8"))).map((t) => t[0].toUpperCase() + t.slice(1)));
    const unused = Object.keys(ELEMENTS).filter((k) => k !== "ColorManagement" && !used.has(k));
    expect(unused).toEqual([]);
  });
});
