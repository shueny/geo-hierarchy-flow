// Interaction checks for the globe / 2D map.   usage: node scripts/verify-3d/globe.cjs <baseUrl>
// The globe renders on demand: a frame is drawn only while something moves (drag, inertia, camera
// flight, morph) or after something changed (hover, selection, resize). These checks pin both halves:
// it STILL reacts to everything, and it draws NOTHING when nothing happens.
// "renders" = gl.clear calls = frames drawn (see kit.GL_COUNTERS).
const os = require("node:os");
const path = require("node:path");
const kit = require("./kit.cjs");

const base = process.argv[2];
if (!base) throw new Error("usage: globe.cjs <baseUrl>");
const out = process.env.VERIFY_OUT || os.tmpdir();
const results = [];
let pageNow = null;
const shots = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok && pageNow) shots.push(pageNow.screenshot({ path: path.join(out, `verify-globe-FAIL-${results.length}.png`) }).catch(() => {}));
};

// software GL draws ~1 frame per second here, so every window is long and every wait targets a state
const renders = (page) => page.evaluate(() => window.__gl.other.renders);
// The loop must come to rest on its own (settled), and then stay at rest for `ms` (frames === 0).
// Counting from the moment a gesture ends would only measure the last frames still in flight.
const quiet = async (page, ms = 6000, maxSettleMs = 90000) => {
  const t0 = Date.now();
  let prev = await renders(page);
  let settled = false;
  while (Date.now() - t0 < maxSettleMs) {
    await page.waitForTimeout(3500);
    const now = await renders(page);
    if (now === prev) { settled = true; break; }
    prev = now;
  }
  const r0 = await renders(page);
  await page.waitForTimeout(ms);
  const frames = (await renders(page)) - r0;
  return { frames, settled, ok: settled && frames === 0, text: settled ? `${frames} frames in ${ms / 1000} s at rest` : "never came to rest" };
};
const untilCond = async (page, fn, maxMs = 30000) => {
  const t0 = Date.now();
  let v = await fn();
  while (!v.ok && Date.now() - t0 < maxMs) { await page.waitForTimeout(250); v = await fn(); }
  return v;
};
// where a site's marker is on screen (label box: 120 wide, anchored 34 px above the marker) + whether its label shows
const site = (page, name) =>
  page.evaluate((n) => {
    const l = [...document.querySelectorAll(".globe-label")].find((x) => x.textContent === n);
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { x: r.left + 60, y: r.top + 34, shown: +getComputedStyle(l).opacity > 0.5, selected: l.classList.contains("is-selected") };
  }, name);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

(async () => {
  const browser = await kit.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: "en-US" });
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  pageNow = page;
  await page.addInitScript(kit.GL_COUNTERS);
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.goto(base);
  await page.waitForSelector(".globe canvas");
  const box = await page.locator(".globe canvas").boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // wait for the first frame, then for the loop to go quiet
  await untilCond(page, async () => ({ ok: (await renders(page)) > 0 }));
  await page.waitForTimeout(3000);

  check("[idle] the globe has drawn at least once", (await renders(page)) > 0);
  const idle = await quiet(page);
  check("[idle] an untouched globe draws nothing", idle.ok, idle.text);

  // —— drag: rotates, keeps gliding, then comes to rest ——
  const tokyo0 = await site(page, "Tokyo DC");
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(centre.x - i * 12, centre.y);
  const r1 = await renders(page);
  const tokyoHeld = await site(page, "Tokyo DC");
  await page.mouse.up();
  check("[drag] the globe rotates under the pointer", dist(tokyo0, tokyoHeld) > 30 || (await renders(page)) > r1 - 1, `${dist(tokyo0, tokyoHeld).toFixed(0)} px`);
  const glide = await untilCond(page, async () => {
    const t = await site(page, "Tokyo DC");
    return { ok: dist(t, tokyoHeld) > 20, t };
  });
  check("[drag] it keeps gliding after release (inertia)", glide.ok, `${dist(glide.t, tokyoHeld).toFixed(0)} px past release`);
  // at rest = no new frame for a long window; the loop must get there on its own
  const rest = await untilCond(page, async () => {
    const a = await renders(page);
    await page.waitForTimeout(5000);
    return { ok: (await renders(page)) === a };
  }, 90000);
  check("[drag] inertia winds down and the loop stops by itself", rest.ok);
  const tokyoRest = await site(page, "Tokyo DC");
  check("[drag] it settled somewhere new", dist(tokyoRest, tokyo0) > 30, `${dist(tokyoRest, tokyo0).toFixed(0)} px from start`);

  // —— hover: label shows and hides, with nothing else moving ——
  await page.goto(base); // back to the start view (the drag moved Tokyo)
  await page.waitForSelector(".globe canvas");
  await untilCond(page, async () => ({ ok: (await renders(page)) > 0 }));
  await page.waitForTimeout(3000);
  const tk = await site(page, "Tokyo DC");
  check("[hover] label hidden before hovering", tk && !tk.shown);
  await page.mouse.move(tk.x, tk.y);
  const hov = await untilCond(page, async () => ({ ok: (await site(page, "Tokyo DC")).shown }));
  check("[hover] pointer over a marker shows its label", hov.ok);
  await page.mouse.move(centre.x + 300, centre.y - 250);
  const hovOff = await untilCond(page, async () => ({ ok: !(await site(page, "Tokyo DC")).shown }));
  check("[hover] leaving the marker hides it again", hovOff.ok);
  const idleAfterHover = await quiet(page, 5000);
  check("[hover] and the loop is quiet again", idleAfterHover.ok, idleAfterHover.text);

  // —— click: selects, and the camera flies there ——
  const tokyo = await site(page, "Tokyo DC");
  await page.mouse.move(tokyo.x, tokyo.y);
  await page.mouse.down();
  await page.mouse.up();
  const sel = await untilCond(page, async () => ({ ok: (await site(page, "Tokyo DC")).selected }));
  check("[click] clicking a marker selects it", sel.ok);
  const fly = await untilCond(page, async () => {
    const t = await site(page, "Tokyo DC");
    return { ok: dist(t, centre) < 80, t };
  });
  check("[click] the camera flies to the selected site", fly.ok, fly.t ? `${dist(fly.t, centre).toFixed(0)} px from centre` : "");
  const idleAfterFly = await quiet(page, 8000);
  const landed = await site(page, "Tokyo DC");
  check("[click] the flight ends and the loop goes quiet", idleAfterFly.ok, idleAfterFly.text);
  check("[click] it landed on the site", dist(landed, centre) < 40, `${dist(landed, centre).toFixed(0)} px from centre`);

  // —— 2D: the globe flattens ——
  await page.getByText("2D map").click();
  const flat = await untilCond(page, async () => {
    const [f, s, a] = await Promise.all([site(page, "Frankfurt DC"), site(page, "San Jose DC"), site(page, "Ashburn DC")]);
    return { ok: a.x - f.x > 500 && a.x > s.x, f, a };
  }, 60000);
  check("[2D] the globe flattens into a map", flat.ok, flat.a ? `Frankfurt→Ashburn ${(flat.a.x - flat.f.x).toFixed(0)} px` : "");
  const idleFlat = await quiet(page, 8000);
  check("[2D] the flat map is quiet too", idleFlat.ok, idleFlat.text);
  await page.getByText("3D globe").click();
  const round = await untilCond(page, async () => {
    const [f, a] = await Promise.all([site(page, "Frankfurt DC"), site(page, "Ashburn DC")]);
    return { ok: a.x - f.x < 400 };
  }, 60000);
  check("[2D] and back to a globe", round.ok);

  // —— resize: setSize clears the canvas, so a frame must follow ——
  await page.waitForTimeout(2000);
  const rz0 = await renders(page);
  await page.setViewportSize({ width: 1300, height: 900 });
  const rz = await untilCond(page, async () => ({ ok: (await renders(page)) > rz0 }));
  check("[resize] a resized canvas is redrawn", rz.ok);
  await page.setViewportSize({ width: 1600, height: 1000 });

  // —— layout B: the globe layer stays mounted (hidden) after drill-down; it must not keep drawing ——
  await page.goto(`${base}?layout=B`);
  await page.waitForSelector(".globe canvas");
  await untilCond(page, async () => ({ ok: (await renders(page)) > 0 }));
  await page.waitForTimeout(3000);
  const fr = await site(page, "Tokyo DC");
  await page.mouse.move(fr.x, fr.y);
  await page.mouse.down();
  await page.mouse.up();
  const drilled = await untilCond(page, async () => ({ ok: await page.locator(".stage__layer.is-active .react-flow").first().isVisible().catch(() => false) }), 30000);
  check("[layout B] clicking a site drills into its graph", drilled.ok);
  await page.waitForTimeout(4000);
  const hiddenIdle = await quiet(page, 6000);
  check("[layout B] the hidden globe layer draws nothing", hiddenIdle.ok, hiddenIdle.text);

  // —— layout C: the mini globe sits behind the hall overlay ——
  await kit.openHall(page, base, "Hall A");
  await page.waitForTimeout(3000);
  const behind = await quiet(page, 6000);
  check("[layout C] the mini globe behind the open hall draws nothing", behind.ok, behind.text);

  check("no console errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await Promise.all(shots);
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} globe checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
