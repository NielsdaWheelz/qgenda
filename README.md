# qgenda

A local physician-schedule generator. A scheduler maintains the **facts** of a scheduling period
through forms — providers, eligibility, FTE, vacations, demand templates, holidays, weekend blocks, and
opening fairness — then generates a deterministic monthly schedule, reviews whether it is fair and valid,
and exports it as a printable page, CSV, or calendar (ICS).

Humans never edit solver input. A pure compiler turns the planning state into the engine's scenario; the
deterministic MiniZinc/CP-SAT engine remains the only assignment authority. See
`docs/specs/v0.2-local-usable-mvp-spec.md` for the full spec and `docs/architecture.md` for the
architecture.

## Requirements

- [Bun](https://bun.com) (runtime, package manager, test runner). SQLite ships with Bun (`bun:sqlite`).
- [MiniZinc](https://www.minizinc.org) **with the OR-Tools CP-SAT backend**, on `PATH`. Install the
  official bundle (it ships CP-SAT and Chuffed); the distro `minizinc` package only includes Gecode,
  which finds optimal-valued schedules but cannot *prove* optimality on this objective.

  ```sh
  mkdir -p .tools/minizinc
  curl -fsSL -o /tmp/mzn.tgz \
    https://github.com/MiniZinc/MiniZincIDE/releases/download/2.9.7/MiniZincIDE-2.9.7-bundle-linux-x86_64.tgz
  tar xzf /tmp/mzn.tgz -C .tools/minizinc --strip-components=1
  export PATH="$PWD/.tools/minizinc/bin:$HOME/.bun/bin:$PATH"
  minizinc --solvers | grep cp-sat        # verify CP-SAT is visible
  ```

- Chromium for the focused Playwright browser test:

  ```sh
  bunx playwright install chromium
  ```

## Setup

```sh
bun install
```

## Run the app

```sh
bun run dev      # Vite client (http://localhost:5173) + API server (http://localhost:8787), proxied
# or, production-style:
bun run build    # build the client to apps/web/dist
bun run start    # serve the client + API from one process (http://localhost:8787)
```

The local database is created at `apps/web/.local/qgenda.sqlite` (git-ignored). Set `PORT` to change the
server port (default `8787`).

Workflow in the UI: **Roster** (providers, eligibility, vacations, opening ledger) → **Demand** (weekly
templates + date exceptions) → **Calendar Facts** (holidays, weekend blocks) → **Save planning** →
**Generate** (pick a horizon, preview the compile, generate) → **Runs** (review the calendar, fairness
scorecard, hard-rule report, and export).

## Repository shape

A Bun workspace:

```text
packages/core      engine (v0.1), planning schemas, scenario compiler, scorecard, exports
packages/storage   SQLite schema + Drizzle migrations + repositories
apps/web           Hono API server (src/server) + React/Vite client (src/client)
tests/             core / storage / web test tiers + shared fixtures
examples/          scenarios/ (engine fixtures) and planning/ (planning workspaces)
```

Dependency direction is one-way: `apps/web → packages/storage → packages/core`. The engine never imports
storage, HTTP, or UI; the UI never recomputes rules or fairness.

## Engine CLI

The v0.1 engine remains usable directly on a compiled scenario JSON (for engine fixtures and repro):

```sh
bun run solve examples/scenarios/month-basic.json --out .tmp/month-basic.result.json --table
```

## Exports

Every generated run is an immutable snapshot. Exports read the snapshot (never live planning state) and
never recompute assignments:

- **Printable HTML** — month grid, legend, call/weekend/holiday indicators, compact fairness summary.
- **CSV** — `date,slot_id,slot_type,provider_id,provider_name,derived_call,weekend,holiday_id`.
- **ICS** — all-provider or per-provider calendar; byte-stable for a given run snapshot.

## Commands

```sh
bun run dev          # run the local app (client + server)
bun run build        # build the client
bun run start        # serve client + API from one process
bun run preflight    # verify MiniZinc CP-SAT and Playwright Chromium are available
bun run typecheck    # tsc --noEmit across the workspace
bun run test         # web build + all tests, including the focused browser flow
bun run test:e2e     # web build + the focused browser flow only
bun run check        # biome + typecheck + tool preflight + migration drift check + web build + tests
bun run db:generate  # regenerate packages/storage/src/migrations from schema.ts
bun run db:check     # verify committed migrations match schema.ts
```

## How it works

```text
Human planning forms
  -> PlanningState (typed, validated)
  -> compilePlanningScenario  (pure: validate, expand demand/unavailability, attach holidays/weekends)
  -> ScheduleScenario (the v0.1 engine contract)
  -> generateSchedule (Effect Schema decode -> preflight -> MiniZinc/CP-SAT -> postsolve -> scorecard)
  -> immutable run snapshot (planning + scenario + result + hash, stored in SQLite)
  -> review (calendar grid, scorecard) and export (HTML / CSV / ICS)
```

- Contracts are owned by Effect Schema at every JSON boundary. Expected failures are data: compile
  diagnostics (`C_*`) block generation; engine results carry a `status` (`optimal`, `feasible`,
  `infeasible`, `invalid_input`, `solver_error`) — nothing throws for them.
- CP-SAT runs single-threaded (`-p 1`) with free search (`-f`): proven-optimal and byte-deterministic for
  a given scenario. Re-running the same compiled scenario yields the same assignments and scenario hash.
- Postsolve independently re-checks every hard rule from the assignment list; solver output that violates
  a hard rule is reported as `solver_error`, never as success.
