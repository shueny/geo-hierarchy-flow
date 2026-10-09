// Tile ↔ world conversions for the 3D hall. Pure math, no React, no WebGL — unit-tested.
//
// World units are metres, the room is centred on the origin, x runs along the room's
// width and z along its depth. hallLayout.js speaks tiles (1 tile = TILE metres).
import { Plane, Vector3 } from "three";
import { TILE, footprint } from "../hallLayout";

export const WALL_H = 3.0;
export const RACK_H = 2.0;
export const TRAY_Y = 2.45;

/** Frame for a room of layout.width × layout.depth tiles. */
export const roomFrame = (layout) => {
  const W = layout.width * TILE;
  const D = layout.depth * TILE;
  return { W, D, wx: (x) => x * TILE - W / 2, wz: (z) => z * TILE - D / 2 };
};

/** World centre and yaw of a rack standing at tile placement `pos` ({x, z, rot}). */
export const rackTransform = (pos, frame) => {
  const { w, d } = footprint(pos.rot);
  return { x: frame.wx(pos.x) + (w * TILE) / 2, z: frame.wz(pos.z) + (d * TILE) / 2, yaw: (pos.rot * Math.PI) / 2 };
};

// Dragging happens on the plane of the rack tops, not the floor: the point you grabbed
// then stays under the cursor even when the camera looks at an angle.
const GRAB_PLANE = new Plane(new Vector3(0, 1, 0), -RACK_H);
const hit = new Vector3();

/** Where a pointer ray meets the rack-top plane, as fractional tile coordinates; null if it never does. */
export const rayToTile = (ray, frame) => {
  const p = ray.intersectPlane(GRAB_PLANE, hit);
  return p ? { x: (p.x + frame.W / 2) / TILE, z: (p.z + frame.D / 2) / TILE } : null;
};

/** Camera presets for a room; `view` is "perspective" or "top". */
export const cameraPreset = (view, frame) => {
  const span = Math.max(frame.W, frame.D);
  return view === "top"
    ? { pos: new Vector3(0, span * 1.45, 0.01), target: new Vector3(0, 0, 0) }
    : { pos: new Vector3(frame.W * 0.55, span * 0.85, frame.D * 0.95), target: new Vector3(0, 0.6, 0) };
};
