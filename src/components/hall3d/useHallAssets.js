// Things shared by several meshes: textures, geometries and materials.
//
// Rule of thumb for this scene:
//   • used by ONE mesh  → declare it in JSX next to the mesh; R3F disposes it on unmount
//   • used by SEVERAL   → create it once here and dispose it here
// (12 racks that each declared their own door texture would upload 12 copies to the GPU.)
import { useEffect, useMemo } from "react";
import {
  BoxGeometry, CanvasTexture, EdgesGeometry, LineBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, SRGBColorSpace,
} from "three";
import { TILE } from "../hallLayout";
import { RACK_H } from "./units";
import { doorCanvas, floorCanvas, grilleCanvas } from "./textures";

const texture = (canvas) => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

const build = (layout) => {
  const floorTex = texture(floorCanvas(layout));
  const doorTex = texture(doorCanvas());
  const grilleTex = texture(grilleCanvas());

  const cracSide = new MeshStandardMaterial({ color: "#e3e6ea", roughness: 0.6 });
  const cracFront = new MeshStandardMaterial({ map: grilleTex, roughness: 0.6 });

  const rackOutlineBox = new BoxGeometry(TILE + 0.04, RACK_H + 0.04, TILE * 2 + 0.04);
  const assets = {
    floorTex,
    doorTex,
    grilleTex,
    // rack parts
    rackBody: new BoxGeometry(TILE - 0.02, RACK_H, TILE * 2 - 0.02),
    rackDoor: new PlaneGeometry(TILE - 0.06, RACK_H - 0.08),
    rackCap: new BoxGeometry(TILE - 0.04, 0.03, TILE * 2 - 0.04),
    rackLed: new BoxGeometry(0.3, 0.025, 0.01),
    rackOutline: new EdgesGeometry(rackOutlineBox),
    doorMat: new MeshStandardMaterial({ map: doorTex, roughness: 0.55, metalness: 0.35 }),
    outlineMat: new LineBasicMaterial({ color: "#2f6bff" }),
    // room fittings used more than once
    wallMat: new MeshStandardMaterial({ color: "#f4f5f7", roughness: 0.95 }),
    // Light and see-through on purpose: a PDU is scenery, and the dark racks are what you can click.
    // A dark opaque box of rack size read as a rack nobody could select.
    pduMat: new MeshStandardMaterial({ color: "#c3cad3", transparent: true, opacity: 0.55, roughness: 0.9, metalness: 0 }),
    trayMat: new MeshStandardMaterial({ color: "#f2c94c", roughness: 0.5, metalness: 0.3 }),
    glassMat: new MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }),
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z — the grille faces into the room (+x)
    cracMaterials: [cracFront, cracSide, cracSide, cracSide, cracSide, cracSide],
    cracSide,
    cracFront,
  };
  rackOutlineBox.dispose(); // only needed to derive the edges
  return assets;
};

const disposeAll = (assets) => {
  new Set(Object.values(assets).flat()).forEach((a) => a.dispose?.());
};

/** Shared GPU resources for one hall; rebuilt only when the room itself changes, not when racks move. */
export const useHallAssets = (layout) => {
  const { width, depth, coldAisles } = layout;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assets = useMemo(() => build(layout), [width, depth, coldAisles]);
  useEffect(() => () => disposeAll(assets), [assets]);
  return assets;
};
