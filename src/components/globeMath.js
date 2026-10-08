// Shared by the vertex shader (GLSL copy in GlobeMap.jsx) and the marker/label code,
// so markers ride the same surface while it morphs between sphere and plane.
import * as THREE from "three";

// Longitude at the centre of the map. 121°E puts the Asia-Pacific sites mid-screen.
export const LON0 = THREE.MathUtils.degToRad(121);

export const wrapPi = (a) => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * Point on the morphing surface.
 * m = 0 → unit sphere, m = 1 → plane z = 1 spanning [-π, π] × [-π/2, π/2].
 * `lift` pushes the point out along the surface normal (markers float above the ground).
 */
export const surfacePoint = (latDeg, lngDeg, m, lift = 0) => {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = wrapPi(THREE.MathUtils.degToRad(lngDeg) - LON0);
  const s = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const p = new THREE.Vector3(lon, lat, 1);
  const n = s.clone().lerp(new THREE.Vector3(0, 0, 1), m).normalize();
  return { pos: s.lerp(p, m).addScaledVector(n, lift), normal: n };
};

/**
 * Unwraps a ring's longitudes so consecutive points never jump by more than 180°.
 * Rings that cross the antimeridian (Russia, Fiji) would otherwise be filled as a
 * band across the whole map.
 */
export const unwrapRing = (ring) => {
  let prev = null;
  return ring.map(([lng, lat]) => {
    let x = lng;
    if (prev !== null) {
      while (x - prev > 180) x -= 360;
      while (x - prev < -180) x += 360;
    }
    prev = x;
    return [x, lat];
  });
};

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
