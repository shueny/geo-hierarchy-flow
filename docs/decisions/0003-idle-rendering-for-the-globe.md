# 0003 — The globe draws only when something changed; one OrbitControls; two browser suites

- **Status:** accepted, 2026-10-09
- **Covers:** `src/components/GlobeMap.jsx`, `scripts/verify-3d/`, `.github/workflows/deploy.yml` (job `verify-3d`)
- **Follows:** [0001](0001-react-three-fiber-for-3d-scenes.md) (the globe stays on plain three; its "second OrbitControls" tripwire is settled here) and [0002](0002-ci-gate-for-the-3d-hall.md) (the CI gate, now two suites).
- **Process:** the loop in [`CLAUDE.md`](../../CLAUDE.md).

## Context

The hall stopped drawing at idle in 0001 (1,500 → 0 draw calls per 3 s). The globe never did: `tick` re-armed `requestAnimationFrame` every frame and rendered every time. Three places keep a globe alive that nobody can see or touch: the open page with nothing happening, layout B after a drill-down (the globe layer stays mounted at opacity 0) and layout C (the mini globe sits behind the open hall).

## Decisions

### D1 — One copy of OrbitControls

| # | Option | Verdict |
|---|---|---|
| 1 | Keep `three/examples/jsm/controls/OrbitControls.js` in the globe (two copies in the bundle: three's, and three-stdlib's via drei) | Rejected. Nothing needs the second copy. |
| 2 | **Import `OrbitControls` from `three-stdlib`**, the copy drei already ships, and list it as a direct dependency | **Chosen.** One import line. |
| 3 | Move the hall to three's copy instead | Rejected: drei's `<OrbitControls>` wraps three-stdlib's class; replacing it means leaving drei's component. |

Measured (same build settings): 1,128.57 kB / **337.41 kB gzip** → 1,109.58 kB / **333.46 kB gzip** (−4 kB). The tripwire in 0001 guessed this might "start to matter"; it did not (4 kB), and the fix cost one line, so it is closed rather than left open. `three-stdlib` is now a direct dependency because the globe imports it; before it was only reachable through drei.

### D2 — How to stop drawing at idle

| # | Option | Verdict |
|---|---|---|
| 1 | Pause only when the globe is hidden (`IntersectionObserver` / `document.hidden`) | Rejected as the whole answer. It catches layout B's hidden layer, but not an open page where nothing happens, and layout C's mini globe is still laid out and in the viewport behind the open hall, so it never reports hidden. |
| 2 | Cap the frame rate (30 / 15 fps) | Rejected. Halves the cost but is still work forever, and makes drags feel worse. |
| 3 | Migrate the globe to R3F and use `frameloop="demand"` (what the hall does) | Rejected for now: the migration is a rewrite of ~300 lines to get one boolean; 0001 says when it pays (arcs, per-site meshes, 3+ interactions). |
| 4 | **Stay on plain three; render on demand with a wake-up function** | **Chosen.** |

How 4 works. `wake()` schedules one frame if none is scheduled. A frame re-arms itself only if it changed the view: a tween is running, or `controls.update()` returned true (a drag, or damping inertia still decaying). Everything else that changes pixels calls `wake()`:

| What changes | Who wakes it |
|---|---|
| drag, wheel, damping tail | OrbitControls `start` / `change` / `end` |
| 3D ⇄ 2D, fly to a site | `startTween` |
| hover marker changes | `onMove` / `onLeave`, only when the id actually differs |
| selection changes | effect on `selectedId` |
| container resizes (`setSize` clears the canvas) | `resize` |
| first frame | `resize()` at the end of setup |

The frame after a tween always runs `controls.update()` once more, as the old loop did, so OrbitControls can re-clamp the camera before the loop stops. Label text changes (language switch) are DOM only and need no frame.

This also covers layout B's hidden layer and layout C's mini globe without knowing about either: nothing moves there, so nothing is scheduled.

Price: ~12 changed lines in one file; every future source of visual change must call `wake()` (the way R3F's `invalidate()` works), or the globe will look frozen. The suite below exists for that.

### D3 — Proving it, and where the suites live

| # | Option | Verdict |
|---|---|---|
| 1 | Measure once by hand, trust it | Rejected: 0001's pitfall 5 — an idle claim that nobody re-checks decays. |
| 2 | **A second browser suite for the globe beside the hall's, sharing `kit.cjs`; one CI job per suite via a matrix** | **Chosen.** |
| 3 | Fold the globe checks into the hall suite | Rejected: one serial run of both (about 5 minutes locally), and a failure names neither. |

Layout: `scripts/verify-hall/` → `scripts/verify-3d/` (`hall.cjs`, `globe.cjs`, `kit.cjs`, `run.cjs <suite>`); `npm run verify:hall`, `verify:globe`. CI job `verify-3d` has a matrix `suite: [hall, globe]`; `deploy` needs the whole job. The artifact is named `verify-<suite>-screenshots`.

The suite counts **frames**, not draw calls: `kit.GL_COUNTERS` now also counts `gl.clear` (three clears once per frame it renders). Software GL draws about 1–4 frames per second here, so each "quiet" window is long, and each is preceded by a wait until the loop has come to rest *on its own* — counting from the moment a gesture ends would only measure the frames still in flight (the first version of the suite did exactly that and reported 2–5 frames on the correct code).

## Measured

Before the change the suite's idle checks were red and its behaviour checks green (so the suite can fail, and the behaviour it protects existed before):

| Check | Old loop | On demand |
|---|---|---|
| untouched globe, frames in 6 s | 23–24 | **0** |
| after a hover, frames in 5 s | 17 | **0** |
| after a fly-to, frames in 8 s | 29–32 | **0** |
| flat 2D map, frames in 8 s | 32–51 | **0** |
| inertia stops by itself | no | **yes** |
| layout B hidden layer, frames in 6 s | 27–360 | **0** |
| layout C mini globe behind the hall | not reached (page timed out under load) | **0** |

The old numbers are the pre-final measuring logic (a fixed window, not "after it rests"); they show the loop never rests, not an exact rate. The headless frame rate is not representative of a real GPU, which is why frames and not fps are the unit.

Behaviour that must still work and does: drag rotates (176–180 px), inertia keeps gliding after release, hover shows/hides the label, click selects and the camera lands on the site (0 px from centre), 3D → 2D flattens (Frankfurt→Ashburn ≈ 670 px) and back, a resized canvas is redrawn, layout B drills into its graph, no console errors — 22 checks. The hall suite still passes 32/32.

**What the suite does not prove:** a click always starts a fly-to, which wakes the loop by itself, so the `selectedId` effect is not independently pinned (selection changed from outside, e.g. layout C's graph, is the case it serves). Pinning it needs a check that selects without focusing; not done.

## Revisit when

- **Anything new makes the globe change without user input** (animated arcs, a day/night terminator, auto-rotate) → it must keep the loop alive deliberately (`moving = true`) or wake it; re-run D2 and consider R3F (0001).
- **A feature that changes pixels is added and the globe looks frozen** → a `wake()` is missing; add it and a check in `globe.cjs`.
- **The globe moves to R3F** → `frameloop="demand"` replaces D2; keep the suite as is, it is behaviour-level.
- **The globe suite is red twice without a relevant change** → same rule as 0002: make that matrix leg non-gating while the cause is found.
- **Wall time of either suite passes ~5 min in CI** → shard or trim waits (the globe suite is dominated by software-GL frame time).
