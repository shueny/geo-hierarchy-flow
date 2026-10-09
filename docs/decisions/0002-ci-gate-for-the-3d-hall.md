# 0002 — CI runs the 3D-hall browser suite and gates the deploy on it

- **Status:** accepted, 2026-10-09
- **Covers:** `.github/workflows/deploy.yml` (job `verify-hall`), `scripts/verify-hall/`
- **Follows:** [0001](0001-react-three-fiber-for-3d-scenes.md) D9, which left the suite manual and named this as the next step.
- **Process:** the loop in [`CLAUDE.md`](../../CLAUDE.md).

## Context

`npm run verify:hall` drives the hall in a real browser and catches what unit tests cannot (colour, hit-testing, a locked camera, idle rendering). Run by hand it protects nothing the moment someone forgets. This repo deploys from direct pushes to `main`, so a regression that reaches `main` is live within a minute.

Numbers are from real runs of this workflow on GitHub-hosted `ubuntu-latest`, on branches (a branch run never deploys).

## Decisions

### D1 — Where the suite runs

| # | Option | Verdict |
|---|---|---|
| 1 | Extra steps at the end of the existing `build` job | Rejected. Works, but one job then mixes unit tests, build and a browser run: a failure says "build failed", a re-run repeats everything, and a hung browser has no timeout of its own. |
| 2 | **A separate `verify-hall` job beside `build`; `deploy` needs both** | **Chosen.** |
| 3 | A separate workflow that does not block the deploy (PR / nightly / manual) | Rejected. With direct pushes to `main` the regression ships first and is reported afterwards; the suite would only document the damage. |

**The reason is isolation, not speed.** Running beside `build` was expected to make the cost "the longer of the two, not the sum"; measured, it saves about 5 s, because `build` takes only ~20 s. What option 2 really buys: a failing check is its own named job, `Re-run failed jobs` repeats only the browser run, and `timeout-minutes: 15` bounds it. It costs one extra `npm ci` + `build` (~10 s of runner time).

| Pipeline (push to `main`) | Wall time |
|---|---|
| Before | ~25 s build + ~10 s deploy ≈ 35 s |
| Now, cold browser cache | `verify-hall` 145 s → ≈ 155 s |
| Now, warm cache | `verify-hall` 116 s → ≈ 125 s |
| (estimate) option 1, warm | 20 + 16 + 80–103 → ≈ 120–140 s, within ~5 s of option 2 |

So each push now waits **about 1.5–2 minutes longer**. That is the price of the gate.

`verify-hall` steps, warm cache: install 16 s (system libraries; the browser itself comes from cache), build 5 s, suite 80 s (cold: 103 s).

### D2 — Which browser

| # | Option | Verdict |
|---|---|---|
| 1 | Playwright's Chromium, pinned by the `playwright-core` version, `~/.cache/ms-playwright` cached on that version | **Chosen.** Same browser every run; changes only when the dependency does. Cache is 280 MB; a hit saves ~30 s. |
| 2 | Google Chrome preinstalled on the runner image (`CHROMIUM_PATH=/usr/bin/google-chrome`) | Rejected. No download, but the version moves with the runner image — the suite could go red with no change in this repo. |
| 3 | Playwright's Docker image as a job `container:` | Rejected. Pinned and complete, but an image pull on every run and a second place where the browser version lives. |

### D3 — What a red run means

| # | Option | Verdict |
|---|---|---|
| 1 | No retries; a red run blocks the deploy; re-run by hand when the infrastructure was at fault | **Chosen.** A failing check is a signal until shown otherwise. |
| 2 | Retry the whole job once automatically | Rejected. Doubles the cost of a real failure and hides intermittent bugs behind a green second attempt. |
| 3 | Retry individual checks | Rejected. The suite exists to catch timing-sensitive behaviour (a camera that never started moving, a drag that never ended); retrying a check retries the bug away. |

### D4 — Evidence when it fails

| # | Option | Verdict |
|---|---|---|
| 1 | A screenshot of the page for every failing check, uploaded as the `verify-hall-screenshots` artifact | **Chosen.** |
| 2 | Log lines only | Rejected. A CI run cannot be inspected afterwards; "colour wrong, rgb(2,120,55)" does not show a label hiding the rack. |
| 3 | Video or Playwright trace for every run | Rejected for now: large, slow, needs a retention policy. Add for a failure that screenshots cannot explain. |

### Side fix — `concurrency`

The workflow used one global group (`pages`) with `cancel-in-progress: true`: a run on any branch could cancel a deploy in flight, and the branch runs used to test this very change would have done so. It is now one group per ref, and only runs that are not on `main` are cancelled — a push to `main` queues behind a running deploy.

## What was exercised in CI before merging

Each path ran for real (on branches), not just the happy one:

1. **Cold cache** — green, 32/32.
2. **Warm cache** — green, 32/32, 29 s faster: the cache restore and the browser lookup work.
3. **Deliberate failure** (`frameloop` set back to `always` on a throw-away branch) — `verify-hall` red with exactly one failing check (`[perf] … 1100 draw calls in 3 s`), the other 31 green; the artifact uploaded (2 files, ~450 kB); `deploy` skipped.

## Pitfalls found while building it

- **A workflow can only be validated by GitHub.** The first version put `${{ runner.temp }}` in job-level `env`; the `runner` context exists only inside steps, and the whole workflow was rejected at dispatch. Test workflow changes on a branch with `workflow_dispatch` — only `main` deploys.
- A first test of the colour check sampled the cable tray (yellow) instead of a rack top; a check that has not been seen to fail does not count (the suite's colour check was verified by deliberately removing `ColorManagement`, see 0001).

## Revisit when

- **The suite fails twice without a relevant code change** → make the job non-gating (D1 option 3) while the cause is found; it must not train people to ignore a red gate.
- **Wall time passes ~5 min**, or the suite doubles in size → split it into two jobs or shard by check group.
- **A Playwright or runner-image update changes WebGL behaviour** → bump `playwright-core` deliberately (the cache key follows the version) rather than float.
- **GitHub moves the used actions off Node 20** (a deprecation warning already shows on every run) → bump `checkout`, `setup-node`, `cache`, `upload-artifact` together.
- **Real-GPU or touch coverage is wanted** → a different runner type; its own decision.
