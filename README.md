# qgenda

A deterministic physician-schedule generator with a built-in fairness ledger. Given one scenario
JSON file it generates a monthly schedule that covers every required slot, obeys non-negotiable local
rules, minimizes unfairness and clusters, and emits a scorecard a human can use to judge the result.

It is a pure engine first; the CLI is a thin adapter. See `docs/specs/v0.1-generator-spec.md` for the
full specification and `docs/architecture.md` for the architecture.

## Requirements

- [Bun](https://bun.com) (runtime, package manager, test runner).
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

## Setup

```sh
bun install
```

## Use

```sh
# Generate a schedule and write the machine-readable result.
bun run solve examples/scenarios/month-basic.json --out .tmp/month-basic.result.json

# Or via the binary name once linked:
qgenda-solve examples/scenarios/month-basic.json --out .tmp/month-basic.result.json --table
```

CLI flags:

- `--out RESULT_JSON` — write the result JSON to a file (otherwise printed to stdout).
- `--table` — also print a human-readable schedule + fairness ledger to stdout.
- `--strict` — exit non-zero unless the status is `optimal`.
- `--pretty` — pretty-print the result JSON.

Exit codes: `0` for `optimal` (and `feasible` only when the scenario set `allow_feasible_result`);
non-zero for `invalid_input`, `infeasible`, and `solver_error`.

## Commands

```sh
bun test            # unit + integration tests (the solver tests need MiniZinc/CP-SAT on PATH)
bun run typecheck   # tsc --noEmit
bun run check       # biome + typecheck + tests
```

## How it works

`generateSchedule(request)` is a pure function: decode (Effect Schema) → preflight validation → slot
expansion → solve → independent postsolve validation → scorecard. Expected failures are returned as a
`ScheduleResult` with the matching `status`; the function never throws for them.

- Scenario and result contracts are owned by Effect Schema (`src/domain`). The wire format is the
  snake_case JSON shown in the spec; the scenario JSON is the native input API (there is no import
  layer).
- The MiniZinc model (`src/solver/minizinc/model/schedule.mzn`) encodes the hard rules as constraints
  and the soft rules as a hierarchical objective. It runs behind the `Solver` port, so the backend can
  be swapped without touching the contracts.
- CP-SAT runs single-threaded (`-p 1`) with free search (`-f`), which proves optimality and is
  byte-deterministic for a given scenario.
- Postsolve re-checks every hard rule from the generated assignment list; solver output that violates a
  hard rule is reported as `solver_error`, never as success.

Result `status` is one of `optimal`, `feasible`, `infeasible`, `invalid_input`, `solver_error`.
