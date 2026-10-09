# 0001 — The 3D hall uses react-three-fiber; the globe stays on plain three

- **Status:** accepted, 2026-10-09
- **Covers:** `src/components/HallScene.jsx`, `src/components/hall3d/*` (R3F) · `src/components/GlobeMap.jsx` (stays plain three)
- **Process:** the loop in [`CLAUDE.md`](../../CLAUDE.md) — option zero, three real options, test each reason, measure the price, set a tripwire.

## Context

`GlobeMap` was written in plain three.js for a one-mesh prototype. The reasons given then — "two fewer dependencies", "the shader morph is easier to control" — were never tested. The second one is false: R3F runs custom shaders exactly as well.

When the 3D hall came, `GlobeMap` was copied as its base and the choice went with it, unexamined. By then the scene was ~500 imperative lines with a hand-kept dispose list, a `live` ref to push props into a scene that was built once, and a capture-phase DOM listener to stop rack drags from also orbiting the camera. Asked "why not react-three-fiber?", there was no good answer. This record is the answer, and the rules in `CLAUDE.md` exist so the step is not skipped again.

All numbers below were measured in this repo with the same build settings, before and after.

## Decisions

### D1 — How to build the hall scene

| # | Option | Verdict |
|---|---|---|
| 1 | Stay on plain three | Rejected. Scene is built once and props are pushed in through a ref; adding a feature means editing three places (build, sync, dispose). |
| 2 | R3F with the stock `<Canvas>` + drei | Rejected. `<Canvas>` runs `extend(THREE)` (react-three-fiber source says so itself), which registers all of three for JSX and defeats tree-shaking: **+106 kB gzip**. |
| 3 | R3F through its documented `createRoot` API, registering only the elements the scene uses | **Chosen.** |

Why 3: the scene is declared in JSX and follows props (the point of moving), and the cost of 2 is mostly avoidable.

| Build | JS (min) | gzip |
|---|---|---|
| Before — plain three | 969 kB | 286 kB |
| Option 2 — stock `<Canvas>` | 1,340 kB | 393 kB (+107) |
| **Option 3 — `createRoot` + registry** | **1,129 kB** | **337 kB (+52)** |

Cost of 3: `hall3d/SlimCanvas.jsx` (~70 lines of glue: size tracking, event connection, an error boundary) and a registry in `hall3d/elements.js` that must list every three class used as a JSX tag. A test reads the scene's JSX and fails when a tag is missing (or a registered one is unused).

**What R3F did not buy** — so nobody expects it: fewer lines (516 in one file → 288 + nine small files, ≈700 total; two of them, `units` and `elements`, are pure and unit-tested), a smaller bundle (+52 kB gzip), or free disposal of everything (see D5).
**What it bought:** the scene follows props; no `live` ref; hover/click/drag arrive through R3F's events instead of hand-rolled raycasting; idle rendering stopped (D7).

### D2 — Versions

| # | Option | Verdict |
|---|---|---|
| 1 | R3F 8 + drei 9 on the current React 18 | **Chosen.** R3F 8 requires `react >=18 <19`; drei 9 requires R3F 8. |
| 2 | Upgrade the app to React 19, use R3F 9 + drei 10 | Rejected for now: a framework upgrade for one scene. |
| 3 | Latest tags without pinning | Rejected: fails the peer ranges. |

### D3 — Rack drag vs. orbiting the whole room

| # | Option | Verdict |
|---|---|---|
| 1 | In the rack's `onPointerDown`: `controls.enabled = false` + pointer capture; restore on release | **Chosen.** |
| 2 | Keep a capture-phase DOM listener ahead of OrbitControls (the previous approach) | Rejected: works, but needs its own hit-testing beside R3F's. |
| 3 | Disable the controls while hovering a rack | Rejected: touch has no hover. |
| 4 | drei `DragControls` | Rejected: knows nothing about tile snapping or collisions, and still has to toggle the orbit. |

Why 1 works: drei attaches `OrbitControls` to `events.connected` — the element R3F itself listens on (`drei/core/OrbitControls.js`) — and registers later, so R3F's handler runs first and the controls never start. Confirmed by the suite: dragging a rack leaves the camera unchanged.

### D4 — Rack labels

| # | Option | Verdict |
|---|---|---|
| 1 | drei `<Html>` per rack | **Chosen.** Handles projection, hiding behind the camera. |
| 2 | Own DOM overlay projected every frame (previous) | Rejected: re-implements 1. |
| 3 | drei `<Text>` / `<Billboard>` | Rejected: pulls in troika and a font fetch for 2-character names. |

### D5 — Shared GPU resources and disposal

| # | Option | Verdict |
|---|---|---|
| 1 | Anything used by several meshes lives in one hook (`useHallAssets`), disposed in one effect; single-use things are declared in JSX | **Chosen.** |
| 2 | Declare everything in JSX | Rejected: twelve racks would upload twelve door textures. |
| 3 | `useTexture` with data URLs | Rejected: async/suspense for canvas-drawn textures, cache keyed by URL. |

Measured: the hall creates 8 textures — three's 4 built-ins plus floor, door and grille once each, and the shadow map — not one door texture per rack. Be precise about R3F's auto-dispose: it covers objects declared in JSX, not textures passed as props, and when the hall closes the WebGL context is torn down anyway. It is a correctness help while mounted, not a memory saving.

### D6 — Camera presets

| # | Option | Verdict |
|---|---|---|
| 1 | `useFrame` tween over drei `OrbitControls` | **Chosen.** Keeps the feel that was asked for (drag to rotate); flushes orbit inertia before tweening. |
| 2 | drei `CameraControls` (built-in smooth transitions) | Rejected for now: a different feel, and a migration should not redesign. Revisit if focus-on-rack animation is added. |
| 3 | drei `Bounds` | Rejected: fits to objects, not to fixed presets. |

### D7 — Render loop

| # | Option | Verdict |
|---|---|---|
| 1 | `always` (previous) | Rejected. |
| 2 | `demand` — render when something changed | **Chosen.** Measured idle draw calls over 3 s: **1,500 → 0**. |
| 3 | `never` + manual loop | Rejected: re-implements 2. |

Consequence: anything animated must keep asking for frames (`invalidate()` inside `useFrame`) — the camera tween does.

### D8 — Drag state

| # | Option | Verdict |
|---|---|---|
| 1 | Local React state in the scene, updated when the snapped tile changes | **Chosen.** At most a few renders per drag. |
| 2 | Mutate object positions through refs | Rejected: fast but invisible to React; the drop marker and rack would have to be kept in sync by hand. |
| 3 | Lift into `HallView` | Rejected: the parent has no use for a half-finished drag. |

### D9 — Verifying it

| # | Option | Verdict |
|---|---|---|
| 1 | Browser suite in the repo, run by hand: `npm run build && npm run verify:hall` | **Chosen.** |
| 2 | The same as a CI job | Not yet: needs Chromium + software GL on the runner; add if the suite gets flaky locally or the hall changes often. |
| 3 | `@react-three/test-renderer` | Rejected: no WebGL, so it cannot see the bugs below. |
| 4 | Throw-away scripts (what happened before) | Rejected: they vanish with the session. |

Pixel comparison of the default view before/after the migration: mean difference 0.32/255 per channel (it was 4.20 until the colour fix in pitfall 2).

## Pitfalls found during the migration (each cost a debugging detour)

1. **`<Canvas>` registers all of three** — +430 kB rendered; see D1.
2. **A reduced registry must include `ColorManagement`.** R3F reads it from the registry; without it, R3F applies a legacy sRGB→linear conversion on top of three's own and every JSX colour renders too dark. Guarded by a test and a pixel check.
3. **drei `<Html>`'s `pointerEvents` prop does nothing outside `transform` mode.** The label's box (even at opacity 0) then receives pointer events; R3F computes rays from `event.offsetX/Y`, which are relative to the event *target* — so every click near a rack "missed". Fixed with `style={{ pointerEvents: "none" }}`.
4. **R3F does not forward `lostpointercapture` / `pointercancel` to objects.** A browser-cancelled rack drag left the camera locked (`controls.enabled = false`). The scene listens on the canvas itself.
5. **Measuring:** wait for the expected state, not for "it stopped moving" — a camera that has not started animating looks as still as one that finished. And count GL objects per canvas by when the canvas joined the DOM: three's four built-in textures were attributed to the wrong canvas.

## Revisit when

- **`GlobeMap` moves to R3F** when it gains scene content React should drive (arcs between sites, per-site meshes or cards, 3+ interactive behaviours), or when a second copy of `OrbitControls` (three-stdlib's, pulled in by drei, next to three's own) starts to matter. Today it is one mesh and a handful of markers, and nothing is gained.
- **Racks per hall exceed ~200** → `InstancedMesh` (today: ≤14 racks × 5 meshes).
- **The app moves to React 19** → re-evaluate R3F 9 (check whether `<Canvas>` still registers everything).
- **Gzip grows by another ~50 kB**, or R3F ships a fix for the registry coupling → re-measure D1.
- **Focus-on-rack camera animation is requested** → re-open D6.
