// Canvas painters for the hall's textures. They only draw; wrapping them in THREE textures
// (and disposing those) is useHallAssets' job.
const PX_PER_TILE = 64;

const paint = (w, h, draw) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
};

/** Raised floor: 600 mm tiles with seams; perforated tiles in the cold aisles. */
export const floorCanvas = (layout) =>
  paint(layout.width * PX_PER_TILE, layout.depth * PX_PER_TILE, (ctx, w, h) => {
    ctx.fillStyle = "#d9dde3";
    ctx.fillRect(0, 0, w, h);
    layout.coldAisles.forEach((a) => {
      for (let x = a.x; x < a.x + a.w; x += 1) {
        for (let z = a.z; z < a.z + a.d; z += 1) {
          const px = x * PX_PER_TILE;
          const pz = z * PX_PER_TILE;
          ctx.fillStyle = "#c6ccd5";
          ctx.fillRect(px, pz, PX_PER_TILE, PX_PER_TILE);
          ctx.fillStyle = "#8e98a6";
          for (let i = 8; i < PX_PER_TILE - 4; i += 7) {
            for (let j = 8; j < PX_PER_TILE - 4; j += 7) {
              ctx.beginPath();
              ctx.arc(px + i, pz + j, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });
    ctx.strokeStyle = "#a9b0ba";
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += PX_PER_TILE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let z = 0; z <= h; z += PX_PER_TILE) {
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(w, z); ctx.stroke();
    }
  });

/** Rack front door: perforated steel with a handle. */
export const doorCanvas = () =>
  paint(128, 432, (ctx, w, h) => {
    ctx.fillStyle = "#23272e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a4049";
    for (let y = 16; y < h - 16; y += 6) {
      for (let x = 12; x < w - 12; x += 6) ctx.fillRect(x, y, 3, 3);
    }
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(w - 16, h * 0.42, 5, h * 0.16);
  });

/** Cooling unit front: horizontal grille. */
export const grilleCanvas = () =>
  paint(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b9c0c8";
    for (let y = 40; y < h - 20; y += 8) ctx.fillRect(10, y, w - 20, 3);
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(14, 12, 36, 16);
  });
