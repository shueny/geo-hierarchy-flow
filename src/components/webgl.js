// One WebGL capability probe for every 3D view.
// The answer can't change during a visit, so it is computed once; and the probe
// context is released right away instead of waiting for GC (browsers cap live contexts at ~16).
let cached;

export const hasWebGL = () => {
  if (cached !== undefined) return cached;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    cached = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
};
