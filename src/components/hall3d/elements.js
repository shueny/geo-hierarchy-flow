// The three.js classes the hall scene may use as JSX elements (<mesh>, <group>, …).
//
// R3F resolves JSX tags by looking them up in a registry we fill with extend(). <Canvas> fills it
// with the WHOLE of three (which also stops the bundler from tree-shaking three); we register
// only what the scene declares. The registry is also where R3F looks up `ColorManagement` to
// decide how to treat colours — leave it out and R3F falls back to a legacy sRGB→linear
// conversion on top of three's own, so every JSX colour renders too dark.
import {
  BoxGeometry, Color, ColorManagement, DirectionalLight, Group, HemisphereLight, LineSegments, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
} from "three";

export const ELEMENTS = {
  ColorManagement, // not an element: R3F reads it from here (see above)
  Group, Mesh, LineSegments, BoxGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial,
  HemisphereLight, DirectionalLight, Color,
};
