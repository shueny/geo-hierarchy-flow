// Interaction checks for the 3D hall.   usage: node scripts/verify-3d/hall.cjs <baseUrl>
// (npm run verify:hall builds nothing: run `npm run build` first; it serves dist/ and runs this.)
//
// Each check prints PASS/FAIL; the process exits 1 if any fails. Waits are on EXPECTED states
// (kit.until), never on "looks settled" or a guessed delay — a camera that hasn't started its
// animation looks just as still as one that has finished.
const os = require("node:os");
const path = require("node:path");
const kit = require("./kit.cjs");

const base = process.argv[2];
if (!base) throw new Error("usage: hall.cjs <baseUrl>");
const out = process.env.VERIFY_OUT || os.tmpdir();
const results = [];
// A failing check leaves a screenshot of the page it was about: in CI there is no way to look at the
// run afterwards, so the picture is the only evidence of what the browser actually showed.
let pageNow = null;
const shots = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok && pageNow) {
    shots.push(pageNow.screenshot({ path: path.join(out, `verify-hall-FAIL-${results.length}.png`) }).catch(() => {}));
  }
};

(async () => {
  const browser = await kit.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: "zh-TW" });
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  pageNow = page;
  await page.addInitScript(kit.GL_COUNTERS);
  await kit.openHall(page, base);

  const box = await page.locator(".hall-scene canvas").boundingBox();
  const lc = (n) => kit.labelCenter(page, n);
  const notice = () => page.locator(".hallview__notice").innerText();
  const editBtn = page.getByRole("button", { name: "移動機櫃" });
  const toTop = async () => {
    await page.getByText("俯視").click();
    return kit.until(page, kit.TOP);
  };

  // —— render loop: nothing changes → nothing is drawn ——
  const d0 = await page.evaluate(() => window.__gl.hall.draws);
  await page.waitForTimeout(3000);
  const idle = (await page.evaluate(() => window.__gl.hall.draws)) - d0;
  check("[perf] an idle hall draws nothing (frameloop=demand)", idle === 0, `${idle} draw calls in 3 s`);

  const top0 = await toTop();
  check("top preset reached", kit.TOP(top0), top0);

  // —— colour: JSX colours must not be converted twice (R3F reads ColorManagement from its registry) ——
  // sample the front half of the rack's top: the cable tray runs over the middle of the row
  const c1 = await lc("A1");
  const c2x = await lc("A2");
  const tilePx = Math.abs(c2x.x - c1.x);
  const [r, g, b] = await kit.pixel(page, c2x.x, c2x.y + tilePx * 0.7);
  check("[colour] a healthy rack's top is the bright status green, not a darkened one", g >= 150 && r < 120 && b < 170, `rgb(${r}, ${g}, ${b})`);

  // —— what is clickable must look clickable ——
  const namesOn = await page.locator(".hall-label.is-visible").count();
  check("[affordance] every rack carries its name on first open", namesOn === 12 && (await page.getByLabel("顯示所有機櫃名稱").isChecked()), `${namesOn} names`);
  // the PDU stands right after the end of row A (A6): light and see-through, unlike the dark racks
  const a6 = await lc("A6");
  const [pr, pg, pb] = await kit.pixel(page, a6.x + tilePx, a6.y + tilePx * 0.7);
  check("[affordance] a PDU is pale scenery, not a dark rack-like box", (pr + pg + pb) / 3 > 150, `rgb(${pr}, ${pg}, ${pb})`);

  // —— view mode ——
  let a1 = await lc("A1");
  await page.mouse.click(a1.x, a1.y);
  await page.waitForTimeout(300);
  check("[view] click selects the rack", (await kit.card(page)).startsWith("(4, 3)"), await kit.card(page));
  await kit.drag(page, a1, { x: a1.x + 400, y: a1.y });
  const orbited = await kit.camProxy(page);
  check("[view] dragging on a rack orbits the room", orbited !== top0, `${top0} → ${orbited}`);
  check("[view] …and does not move the rack", (await kit.card(page)).startsWith("(4, 3)"), await kit.card(page));
  check("[view] …and raises no notice", (await notice()) === "");

  // —— edit mode ——
  await editBtn.click();
  check("[edit] toggle is pressed and the hint is shown", (await editBtn.getAttribute("aria-pressed")) === "true" && (await notice()).includes("已開啟"));
  await page.getByText("3D", { exact: true }).click();
  const topE = await toTop();
  check("[edit] back at the top preset", kit.TOP(topE), topE);
  a1 = await lc("A1");
  const a2 = await lc("A2");
  const tile = a2.x - a1.x;
  await kit.drag(page, a1, { x: a1.x + tile * 8, y: a1.y });
  check("[edit] dragging a rack moves it (4,3 → 12,3)", (await kit.card(page)).startsWith("(12, 3)"), await kit.card(page));
  check("[edit] …and the camera holds still", (await kit.camProxy(page)) === topE, `${topE} → ${await kit.camProxy(page)}`);

  // dropping onto another rack is refused (the screenshot shows the red footprint mid-drag)
  const a3 = await lc("A3");
  const a4 = await lc("A4");
  await page.mouse.move(a3.x, a3.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a3.x + ((a4.x - a3.x) * i) / 12, a3.y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, "verify-hall-blocked-drag.png") });
  await page.mouse.up();
  await page.waitForTimeout(800);
  check("[edit] dropping onto another rack is refused with a notice", (await notice()).includes("放不下"), await notice());
  check("[edit] …and the rack returns to its tile", (await kit.card(page)).startsWith("(6, 3)"), await kit.card(page));

  const before = await kit.camProxy(page);
  await kit.drag(page, { x: box.x + 300, y: box.y + box.height - 60 }, { x: box.x + 600, y: box.y + box.height - 60 });
  check("[edit] dragging the floor still orbits", (await kit.camProxy(page)) !== before, `${before} → ${await kit.camProxy(page)}`);

  // the browser can cancel a drag midway (window switch…): the rack goes home and the camera must not stay locked
  const c2 = await lc("A2");
  await page.mouse.click(c2.x, c2.y);
  await page.waitForTimeout(250);
  const a2pos = await kit.card(page);
  await page.mouse.move(c2.x, c2.y);
  await page.mouse.down();
  await page.mouse.move(c2.x + 120, c2.y + 90, { steps: 6 });
  await page.evaluate(() => document.querySelector(".hall-scene canvas").dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })));
  await page.mouse.up();
  await page.waitForTimeout(500);
  check("[cancel] a cancelled drag leaves the rack where it was", (await kit.card(page)) === a2pos, `${a2pos} → ${await kit.card(page)}`);
  const camBefore = await kit.camProxy(page);
  await kit.drag(page, { x: box.x + 300, y: box.y + box.height - 60 }, { x: box.x + 600, y: box.y + box.height - 60 });
  check("[cancel] …and the camera still orbits afterwards (not left locked)", (await kit.camProxy(page)) !== camBefore, `${camBefore} → ${await kit.camProxy(page)}`);

  // keyboard rotate, persistence across a reload
  a1 = await lc("A1");
  await page.mouse.click(a1.x, a1.y);
  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  check("[edit] R rotates the selected rack", (await kit.card(page)).includes("→"), await kit.card(page));
  await page.goto(`${base}?layout=C`);
  await page.waitForSelector(".node--room");
  await page.locator(".node--room", { hasText: "A 機房" }).first().dispatchEvent("click");
  await page.waitForSelector(".hall-scene canvas");
  await page.waitForSelector(".hall-label", { state: "attached" });
  await page.waitForTimeout(1200);
  await toTop();
  a1 = await lc("A1");
  await page.mouse.click(a1.x, a1.y);
  await page.waitForTimeout(300);
  check("[persist] the layout survives a reload", (await kit.card(page)).startsWith("(12, 3)") && (await kit.card(page)).includes("→"), await kit.card(page));

  // 2D floor plan edits the same layout
  await page.getByText("2D 平面圖").click();
  await page.waitForSelector(".plan-rack");
  await page.waitForTimeout(600);
  check("[2D] the floor plan shows the same position", (await kit.card(page)).startsWith("(12, 3)"), await kit.card(page));
  await page.getByText("3D 機房").click();
  await page.waitForSelector(".hall-scene canvas");
  await page.waitForSelector(".hall-label", { state: "attached" });
  await page.waitForTimeout(1200);

  // selection, labels, hover, cursor
  await page.getByLabel("顯示所有機櫃名稱").check();
  await page.waitForTimeout(500);
  const shown = await page.locator(".hall-label.is-visible").count();
  check('[labels] "show all names" shows every rack name', shown === 12, `${shown} visible`);
  await page.getByLabel("顯示所有機櫃名稱").uncheck();
  await page.waitForTimeout(400);
  const only = await page.locator(".hall-label.is-visible").count();
  check("[labels] off → only the selected rack keeps its name", only === 1, `${only} visible`);
  await page.mouse.click(box.x + 60, box.y + box.height - 40);
  await page.waitForTimeout(400);
  check("[select] clicking empty floor deselects", (await page.locator(".rackcard").count()) === 0);
  const b2 = await lc("B2");
  await page.mouse.move(b2.x, b2.y, { steps: 5 });
  await page.waitForTimeout(500);
  check("[hover] hovering a rack shows its name", (await page.locator(".hall-label.is-visible").count()) === 1);
  const cursor = () => page.evaluate(() => document.querySelector(".hall-scene canvas").style.cursor);
  const modeOn = (await editBtn.getAttribute("aria-pressed")) === "true";
  check("[hover] edit mode resets on reload; the cursor over a rack is a pointer in view mode", !modeOn && (await cursor()) === "pointer", `mode on=${modeOn}, cursor=${await cursor()}`);
  await editBtn.click();
  await page.mouse.move(b2.x + 2, b2.y + 2, { steps: 3 });
  await page.waitForTimeout(400);
  check("[hover] …and a grab hand once Move racks is on", (await cursor()) === "grab", await cursor());

  // camera presets right after a quick flick (leftover orbit inertia must not skew the preset)
  await page.mouse.move(box.x + 300, box.y + box.height - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + box.height - 60, { steps: 3 });
  await page.mouse.up();
  await page.getByText("3D", { exact: true }).click();
  const flicked = await toTop();
  check('[camera] a flick followed by "Top" lands exactly on the preset', kit.TOP(flicked), flicked);

  // reset, close, open another hall
  await page.getByText("還原配置").click();
  await page.waitForTimeout(500);
  a1 = await lc("A1");
  await page.mouse.click(a1.x, a1.y);
  await page.waitForTimeout(300);
  check("[reset] the default layout is restored", (await kit.card(page)).startsWith("(4, 3)") && (await kit.card(page)).includes("↓"), await kit.card(page));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("[close] Esc closes the hall", (await page.locator(".hallview").count()) === 0);
  await page.locator(".node--room", { hasText: "B 機房" }).first().dispatchEvent("click");
  await page.waitForSelector(".hall-scene canvas");
  await page.waitForSelector(".hall-label", { state: "attached" });
  await page.waitForTimeout(1200);
  check("[reopen] another hall opens and renders", (await page.locator(".hall-label").count()) === 6, `${await page.locator(".hall-label").count()} racks`);

  check("no console errors or page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await Promise.all(shots);
  await browser.close();

  // —— no WebGL: say so, and keep the rest of the hall usable ——
  const bare = await kit.launch(["--disable-3d-apis", "--disable-gpu"]);
  const p2 = await bare.newPage({ viewport: { width: 1600, height: 1000 }, locale: "zh-TW" });
  pageNow = p2;
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto(`${base}?layout=C`);
  await p2.waitForSelector(".node--room");
  await p2.locator(".node--room", { hasText: "A 機房" }).first().dispatchEvent("click");
  await p2.waitForSelector(".hallview");
  await p2.waitForTimeout(800);
  check("[no WebGL] the hall explains why there is no 3D view", (await p2.locator(".hall-scene--fallback").innerText().catch(() => "")).includes("WebGL"));
  await p2.getByText("2D 平面圖").click();
  await p2.waitForSelector(".plan-rack");
  check("[no WebGL] …and the 2D floor plan still works", (await p2.locator(".plan-rack").count()) === 12 && errs2.length === 0, errs2.join(" | "));
  await Promise.all(shots);
  await bare.close();

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed${failed ? ` — screenshots of the failures are in ${out}` : ""}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
