# Architecture

Date: 2026-06-17
Status: Draft architecture decision (v0.1). Realized and extended by v0.2.

## v0.2 Update

The v0.1 decisions below are implemented. v0.2 (`specs/v0.2-local-usable-mvp-spec.md`) adds the
planning layer the "Future decision" notes anticipated and is the current architecture of record for
the app surface. Concretely:

- The repo is now a Bun workspace: `packages/core` (engine + planning compiler + exports), `packages/storage`
  (SQLite/Drizzle), `apps/web` (Hono API + React/Vite UI). The v0.1 engine moved verbatim into `packages/core/src`.
- Humans edit a typed `PlanningState`, never scenario JSON. A pure compiler (`packages/core/src/compiler`) turns
  planning state into the engine `ScheduleScenario`; the engine remains the only assignment authority.
- SQLite (Drizzle, `bun:sqlite`) stores the planning workspace and immutable run snapshots. Hono is a thin API
  adapter; React/Vite is a thin UI adapter that never recomputes rules or fairness.

The single-package directory architecture and the "no DB / no HTTP / no frontend" notes below describe v0.1
only; the v0.2 spec supersedes them.

## Position

Use TypeScript, Effect, and Bun as the primary application stack.

The application should be TypeScript-first because the hardest long-term problem is not raw solver performance. It is keeping the domain model, scenario schema, rule catalog, validation, scorecard, CLI/API contracts, and future UI in one coherent typed system. TypeScript is also the best fit for the likely future shape: local CLI first, then a small web UI, then optional LLM-assisted onboarding.

The solver should not be hand-written as a TypeScript heuristic. The solver should sit behind a narrow port. v0.1 should use MiniZinc as a target-language solver model invoked from the TypeScript host, with OR-Tools CP-SAT as the preferred MiniZinc backend where available.

This means:

- TypeScript owns product logic.
- Effect Schema owns boundary parsing and contract validation; expected failures are represented in typed result statuses.
- Bun owns package management, scripts, test execution, and local runtime.
- MiniZinc owns the constraint model as a target language.
- The canonical scenario/result schemas remain TypeScript-owned.

This is a higher-layer architecture than a Python-only OR-Tools script because it keeps the product contract in the same language as the future app while preserving a serious optimization backend.

## Source Rules

This architecture follows the shared engineering rules:

- [codebase.md](rules/codebase.md): one primary runtime/package manager/build/test command set; target languages are allowed when the target runtime naturally owns the work.
- [boundaries.md](rules/boundaries.md): parse and narrow untrusted input at the boundary; internal code works with validated typed forms.
- [effect.md](rules/effect.md): explicit effects for failure and async work; no hidden side effects.
- [layers.md](rules/layers.md): service layers and process layers own runtime wiring.
- [testing.md](rules/testing.md): behavior-focused tests.
- [simplicity.md](rules/simplicity.md): no speculative surface and no duplicate code paths.

## External Signals

Current official docs support the stack shape:

- Bun is an all-in-one JavaScript/TypeScript toolkit with runtime, package manager, test runner, and bundler in one binary: https://bun.com/docs
- Bun supports workspaces when the repo needs package boundaries: https://bun.com/docs/pm/workspaces
- Effect provides typed errors, concurrency, resource safety, composability, observability, and type safety for TypeScript programs: https://effect.website/docs/getting-started/introduction/
- Effect Schema defines runtime schemas for validation and transformations: https://effect.website/docs/schema/introduction/
- OR-Tools CP-SAT is designed for integer programming problems and supports Python, C++, Java, and C#, not TypeScript directly: https://developers.google.com/optimization/cp/cp_solver
- MiniZinc is a high-level constraint modeling language with JavaScript support and solver backends including OR-Tools: https://docs.minizinc.dev/en/stable/javascript.html and https://docs.minizinc.dev/en/stable/solvers.html
- MiniZinc supports machine-readable JSON output: https://docs.minizinc.dev/en/stable/json-stream.html
- Hono is a lightweight TypeScript web framework built on web standards and works on Bun: https://hono.dev/
- Drizzle supports TypeScript SQLite usage with Bun: https://bun.com/docs/guides/ecosystem/drizzle
- Biome provides formatting and linting for TypeScript and related web formats: https://biomejs.dev/

## Current Local Environment

Observed on 2026-06-18:

- `node` is installed: `v22.22.3`.
- `python3` is installed: `3.12.3`.
- `bun` is installed at `~/.bun/bin/bun`, but the current shell did not include it on `PATH`.
- System `minizinc` is installed as `2.8.2`, but does not expose CP-SAT.
- A local verification bundle is available at `.tools/minizinc` when installed from the README command; it exposes MiniZinc `2.9.7` with OR-Tools CP-SAT.

Implication:

- Architecture may choose Bun and MiniZinc, but bootstrapping must put Bun and the CP-SAT-enabled MiniZinc bundle on `PATH`.
- Python remains available for experiments, but it is not the primary runtime.

## Product Shape

v0.1 is a local deterministic generator with a built-in scorecard.

The product does not need:

- Auth.
- Database.
- Web app.
- Imports/exports beyond native JSON files.
- Calendar integration.
- QGenda integration.
- LLM onboarding.
- Explain/repair.

The product does need:

- Canonical typed scenario schema.
- Canonical typed result schema.
- Rule catalog.
- Calendar classifier.
- Preflight validator.
- Solver adapter.
- Postsolve validator.
- Scorecard.
- CLI.
- Fixtures.
- Tests.

## Architectural Principles

### One Host Runtime

TypeScript is the host language. Bun is the package manager, script runner, test runner, and local runtime.

Do not add npm, pnpm, yarn, Poetry, uv, Gradle, or Maven for v0.1.

### Target Languages Are Allowed Only At Natural Boundaries

MiniZinc is allowed because constraint modeling is its natural domain.

The MiniZinc model is not application logic. It is a target-language artifact generated from or fed by the TypeScript-owned scenario. It receives validated data and returns a machine-readable solution.

### Canonical Types Live In TypeScript

Provider IDs, dates, rule IDs, slot IDs, scenario requests, solver results, scorecards, and validation errors are TypeScript-owned.

MiniZinc may use integer indexes for solver efficiency, but those indexes are adapter-local and never become product IDs.

### No Duplicate Rule Systems

Each rule has one catalog entry in TypeScript.

The solver adapter may encode a rule into MiniZinc constraints, and the postsolve validator may verify the same rule from generated assignments. That is intentional dual execution of one cataloged rule, not two product rule systems.

Do not implement separate ad hoc rules in CLI, API, UI, examples, or tests.

### Validation Before Solving

Boundary parsing turns unknown JSON into a typed `ScheduleScenario`.

Preflight validation catches missing dates, impossible eligibility pools, capacity errors, and malformed weekend/holiday declarations before invoking MiniZinc.

### Postsolve Validation Is Mandatory

Solver success is not trusted blindly.

Every generated assignment list is independently checked by TypeScript postsolve validation. A solver output that violates a hard rule is `solver_error`, not a partial success.

### Scorecard Is A First-Class Output

The fairness scorecard is not a UI concern. It is produced by the core engine and included in the result contract.

### No Fallback Scheduler

If MiniZinc cannot solve the scenario, v0.1 reports `infeasible`, `unknown`, or `solver_error`.

There is no greedy fallback and no partial schedule returned as success.

## Decision Matrix

### Primary Runtime

Decision: Bun + TypeScript.

Rationale:

- Same language can own CLI, future API, future UI, schemas, validation, and scorecard.
- Bun reduces toolchain surface by combining runtime, package manager, scripts, test runner, and bundler.
- TypeScript fits schema-heavy domain work and future frontend work.

Rejected:

- Python-first app: strong OR-Tools access, but weaker long-term fit for future UI and typed product contracts.
- Java/Kotlin-first app: strong Timefold fit, too heavy for one-user prototype.
- Rust-first app: strong correctness posture, too slow to iterate for domain discovery.

### Effect

Decision: use Effect Schema in the core app for v0.1 boundary contracts; add fuller Effect services only when there are multiple effectful services to compose.

Rationale:

- The app has many typed failure modes: invalid input, infeasible scenario, solver unavailable, solver unknown, postsolve defect, file read/write failure.
- Effect Schema gives a disciplined way to parse unknown JSON into typed scenario/result contracts.
- v0.1 keeps expected runtime failures in the `ScheduleResult.status` contract instead of adding a larger service runtime before it earns its keep.
- Effect Schema can own JSON boundary decoding and result encoding.

Usage boundary:

- Use Effect Schema for JSON boundary contracts in v0.1.
- Add Effect for IO workflows, solver process services, config, and typed error composition when those services multiply.
- Keep pure domain transforms as simple pure functions where Effect adds no value.

### Solver

Decision: use MiniZinc as the v0.1 solver target behind a TypeScript `Solver` port.

Preferred backend:

- OR-Tools through MiniZinc when available.

Fallback backend:

- No runtime fallback in product logic.
- A developer may configure another MiniZinc backend for experiments, but fixtures and CI must declare the backend used.

Rationale:

- Direct OR-Tools has no official TypeScript binding.
- MiniZinc has a JavaScript interface and machine-readable output.
- MiniZinc lets the constraint model stay explicit and reviewable by operations-research-minded readers.
- The TypeScript host remains the source of truth for scenario/result contracts.

Risk:

- MiniZinc may expose less low-level CP-SAT control than direct OR-Tools.

Mitigation:

- Keep `Solver` as a port.
- Keep all product contracts solver-agnostic.
- If v0.1 shows MiniZinc is too limiting, add a Python OR-Tools solver adapter without changing the scenario/result API.

### Python

Decision: not part of v0.1 product architecture.

Allowed:

- One-off research scripts.
- Solver comparison spike.

Not allowed:

- Python-owned product schema.
- Python-owned validation.
- Python CLI as the product entrypoint.
- Python fallback solver.

### Persistence

Decision: no database for v0.1.

The scenario JSON is the input. The result JSON is the output.

Future decision:

- Use SQLite only when the product needs saved scenario history, schedule revisions, or a UI that edits durable state.
- If SQLite is added in a TypeScript/Bun stack, evaluate Drizzle with `bun:sqlite`.

### HTTP

Decision: no HTTP API required for v0.1.

Future decision:

- If an API is needed before a full web app, use Hono because it is lightweight, web-standard, TypeScript-first, and works on Bun.
- Keep the HTTP layer a thin adapter over the core `generateSchedule` capability.

### Frontend

Decision: no frontend for v0.1.

Future decision:

- Use a small React/Vite/Bun app only after CLI fixtures produce credible schedules.
- UI code consumes the same result JSON and must not recompute business rules.

### Formatting And Linting

Decision: use Biome for formatting and basic linting when code is introduced.

Rationale:

- One tool covers TypeScript, JSON, and future frontend formats.
- It avoids an ESLint + Prettier stack before the project needs custom lint rules.

Do not add ESLint initially.

If Effect-specific or type-aware rules become necessary, add them deliberately after there is code that benefits from them.

## Directory Architecture

Start as a single Bun package. Do not introduce workspaces until there are multiple independently runnable apps or reusable packages.

Initial structure:

```text
package.json
bun.lock
tsconfig.json
biome.json
README.md
docs/
  architecture.md
  engineering-rules-subtree.md
  index.md
  qgenda-physician-scheduling-research.md
  rules/
  specs/
    v0.1-generator-spec.md
examples/
  scenarios/
	    month-basic.json
	    month-infeasible-post-call.json
	    month-eye-dental.json
	    month-invalid-eye.json
	    month-invalid-capacity.json
src/
  cli/
    main.ts
  domain/
    calendar.ts
    ids.ts
    scenario.ts
    schedule.ts
  rules/
    catalog.ts
    weights.ts
  validation/
    preflight.ts
    postsolve.ts
  solver/
    Solver.ts
    minizinc/
      MiniZincSolver.ts
      encodeScenario.ts
      decodeSolution.ts
      model/
        schedule.mzn
  scorecard/
    clusters.ts
    ledger.ts
    scorecard.ts
  api/
    generateSchedule.ts
tests/
  fixtures/
  preflight.test.ts
  solver-hard-rules.test.ts
	  scorecard.test.ts
	  cli.test.ts
	  api-contract.test.ts
	  rule-catalog.test.ts
```

Workspace split trigger:

- Add `apps/web` only when there is a real web app.
- Add `packages/core` only when both CLI and web need to import the core.
- Add `packages/solver-minizinc` only if solver packaging needs independent ownership.

Do not start with `apps/` and `packages/` just to look enterprise-grade.

## Module Ownership

### `domain`

Owns:

- Branded IDs.
- Scenario schema.
- Result schema.
- Slot and assignment types.
- Date and weekend/holiday classification.

Does not own:

- Solver variables.
- CLI formatting.
- File IO.

### `rules`

Owns:

- Rule IDs.
- Rule severity.
- Default weights.
- Human-readable rule descriptions.
- Rule-to-scorecard metric mapping.

Does not own:

- Constraint implementation details.
- Scenario parsing.

### `validation`

Owns:

- Preflight input validation.
- Postsolve hard-rule validation.
- Typed validation errors.

Does not own:

- Optimization objective.
- Scorecard presentation.

### `solver`

Owns:

- `Solver` port.
- MiniZinc process invocation.
- Adapter-local mapping from provider/date/slot IDs to MiniZinc indexes.
- MiniZinc model files.
- Solver status classification.

Does not own:

- Scenario schema.
- Business rule catalog.
- Scorecard.
- CLI response formatting.

### `scorecard`

Owns:

- Fairness ledger.
- Cluster metrics.
- Aggregate spread/variance/delta metrics.

Does not own:

- Solver objective.
- Hard-rule enforcement.

### `api`

Owns:

- Pure product capability: `generateSchedule`.
- Capability-level composition of parse, validate, solve, postsolve, scorecard.

Does not own:

- File IO.
- HTTP.
- CLI argument parsing.

### `cli`

Owns:

- Argument parsing.
- Reading scenario files.
- Writing result files.
- Exit codes.

Does not own:

- Domain validation.
- Rules.
- Scorecard calculations.

## Process Flow

```text
CLI
  -> read JSON file
  -> Effect Schema decode
  -> preflight validation
  -> slot expansion
  -> Solver.solve(scenario)
     -> encode MiniZinc data
     -> run MiniZinc process
     -> decode JSON stream solution
     -> map solver indexes back to branded IDs
  -> postsolve validation
  -> scorecard
  -> write result JSON
```

## Error Model

Expected failures are represented as `ScheduleResult.status` plus diagnostic warnings or hard-rule violations:

- `ScenarioDecodeError`
- `PreflightValidationError`
- `SolverUnavailableError`
- `SolverTimedOutError`
- `SolverInfeasibleError`
- `SolverUnknownError`
- `SolverOutputDecodeError`
- `PostsolveViolationError`
- `FileReadError`
- `FileWriteError`

Do not throw raw strings for expected failures.

Unexpected defects may still die loudly, but expected input, infeasibility, solver availability, solver output, and postsolve failures must be represented in the result contract.

## Solver Status Contract

Map MiniZinc statuses into product statuses:

- SAT/OPTIMAL -> `optimal` or `feasible`, depending on proof/status.
- UNSATISFIABLE -> `infeasible`.
- UNKNOWN / timeout without accepted solution -> `solver_error` with diagnostics.
- Process missing -> `solver_error` with diagnostics.
- Malformed solver output -> `solver_error`.

The product result must not expose raw MiniZinc output as the primary status.

## Scenario And Result Contracts

Scenario and result schemas are public internal contracts.

Rules:

- Include `schema_version`.
- Use stable string IDs externally.
- Use branded IDs internally.
- Keep all date strings in ISO `YYYY-MM-DD`.
- Keep timezone explicit even if v0.1 only supports one timezone.
- Reject unknown top-level fields.
- Return objective contributions and scorecard metrics by rule ID.

## Testing Strategy

Use `bun test`.

Required test layers:

- Schema decode tests.
- Preflight validation tests.
- Calendar classifier tests.
- Rule catalog completeness tests.
- Solver fixture tests.
- Postsolve validation tests.
- Scorecard tests.
- CLI contract tests.

Solver tests:

- Keep fixtures small and deterministic.
- Assert hard-rule outcomes, not exact full schedules except for tiny fixtures where uniqueness is intended.
- Assert scorecard invariants and ranges.
- Include at least one infeasible fixture.

Future property testing:

- Add property-generated small scenarios after the deterministic fixture suite is stable.

## Tooling Contract

Required commands after code exists:

```sh
bun install
bun test
bun run typecheck
bun run check
bun run solve examples/scenarios/month-basic.json
```

Command ownership:

- `bun test`: tests.
- `bun run typecheck`: TypeScript check.
- `bun run check`: formatting/linting/typecheck/test gate.
- `bun run solve`: CLI wrapper.

External tools:

- `minizinc` CLI must be available for v0.1 solver runs.
- The selected MiniZinc backend must be documented in `README.md`.

## SME Approach

A scheduling SME would not begin with framework choice. They would ask:

1. What is the canonical scheduling unit: day, list, room, call, clinic, or weekend block?
2. Which rules are impossible-to-break safety/policy constraints?
3. Which rules are fairness preferences with tunable weights?
4. What metrics prove the schedule is better?
5. What happens when the rulebook is infeasible?
6. What data is required before the solver is allowed to run?
7. Which outputs let a doctor trust or challenge the result?

The architecture must therefore optimize for:

- Rule traceability.
- Typed scenario contracts.
- Explicit failure.
- Solver isolation.
- Scorecard transparency.
- Fixture-driven validation.

The framework exists to protect those concerns, not to become the product.

## SOTA / Meta View

The current state of the art for this problem is not "AI schedules doctors."

The strongest architecture is:

- Deterministic optimization for assignments.
- Declarative constraints.
- Human-owned policy.
- Transparent scorecards.
- Postsolve validation.
- Scenario branching for later repair.
- LLM only for future draft extraction and explanation, never for final assignment authority.

The meta move is to keep the optimization core small, inspectable, and replaceable. The product should be able to swap MiniZinc for direct OR-Tools, Timefold, or another solver without changing provider IDs, scenarios, result shape, scorecard, or UI.

## Open Decisions

Resolve before implementation:

1. Use the MiniZinc JavaScript interface or invoke `minizinc` as a process.
   - Default recommendation: process invocation first. It is easier to debug, log, reproduce, and replace.
2. Preferred MiniZinc backend in local development.
   - Default recommendation: OR-Tools if installed cleanly; otherwise Chuffed/Gecode for early fixtures, with OR-Tools required before performance claims.
3. Whether `bun` installation is managed by README only or a checked-in setup script.
   - Default recommendation: README first.
## Architecture Acceptance Criteria

This architecture is correctly implemented when:

- There is one primary package manager: Bun.
- There is one host language: TypeScript.
- Scenario/result contracts are Effect Schema-owned.
- CLI is a thin adapter over `generateSchedule`.
- MiniZinc is isolated behind `Solver`.
- No CLI/API/UI code contains scheduling rules.
- No solver output bypasses postsolve validation.
- Scorecard is produced by core code, not presentation code.
- Tests prove hard rules and scorecard behavior.
- The implementation can replace MiniZinc with another solver adapter without changing scenario/result contracts.
