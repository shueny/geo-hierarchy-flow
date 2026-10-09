// Browser helpers for verifying the 3D hall. Everything goes through a real Chromium (software GL),
// because the bugs worth catching here — wrong colours, swallowed clicks, a locked camera — only
// exist once WebGL, the DOM and the pointer are all in play.
//
// Chromium: Playwright's own by default; set CHROMIUM_PATH to use an installed one.
const { chromium } = require("playwright-core");

exports.launch = (extraArgs = []) =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", ...extraArgs],
  });

// Count GL work per canvas: the globe keeps drawing behind the hall and must not pollute the hall's numbers.
exports.GL_COUNTERS = () => {
  window.__gl = { hall: { draws: 0 }, other: { draws: 0 } };
  const bucket = (ctx) => (ctx.canvas && ctx.canvas.closest && ctx.canvas.closest(".hall-scene") ? window.__gl.hall : window.__gl.other);
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctx) continue;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = Ctx.prototype[fn];
      Ctx.prototype[fn] = function (...a) { bucket(this).draws++; return orig.apply(this, a); };
    }
  }
};

exports.openHall = async (page, base, hall = "A 機房") => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?layout=C`);
  await page.waitForSelector(".node--room");
  await page.locator(".node--room", { hasText: hall }).first().dispatchEvent("click");
  await page.waitForSelector(".hall-scene canvas");
  await page.waitForSelector(".hall-label", { state: "attached" });
  await page.waitForTimeout(1500);
};

// Centre of a rack's name label. Labels ignore the pointer, so clicking there hits what is under them.
exports.labelCenter = (page, name) =>
  page.evaluate((n) => {
    const l = [...document.querySelectorAll(".hall-label")].find((x) => x.textContent === n);
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);

// Row B never moves in these checks, so its on-screen angle and length fingerprint the camera.
exports.camProxy = async (page) => {
  const p = await exports.labelCenter(page, "B1");
  const q = await exports.labelCenter(page, "B6");
  return `${((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI).toFixed(1)}°/${Math.hypot(q.x - p.x, q.y - p.y).toFixed(0)}px`;
};

exports.TOP = (v) => /^-?0\.0°\//.test(v);

// Wait for the EXPECTED camera state, not for "it stopped moving": a camera that has not started its
// animation yet also looks still. Returns the last reading so the caller's check reports what it saw.
exports.until = async (page, pred, maxMs = 15000) => {
  const t0 = Date.now();
  let v = await exports.camProxy(page);
  while (!pred(v) && Date.now() - t0 < maxMs) {
    await page.waitForTimeout(200);
    v = await exports.camProxy(page);
  }
  return v;
};

exports.card = async (page) => ((await page.locator(".rackcard").innerText().catch(() => "(none)")).match(/\(.*\).*/) || ["(none)"])[0];

exports.drag = async (page, from, to, steps = 15, settle = 1500) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
  await page.waitForTimeout(settle);
};

// RGB of one screen pixel, read back through a canvas (no image library needed)
exports.pixel = async (page, x, y) => {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 }, type: "png" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, png.toString("base64"));
};
