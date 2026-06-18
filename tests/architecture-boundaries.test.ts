import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = join(import.meta.dir, "..")

function filesUnder(dir: string, suffixes = [".ts", ".tsx"]): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name === "node_modules") continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (suffixes.some((suffix) => path.endsWith(suffix))) out.push(path)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

function read(path: string): string {
  return readFileSync(path, "utf8")
}

function packageExports(packageDir: string): Record<string, unknown> {
  return JSON.parse(read(join(root, packageDir, "package.json"))).exports ?? {}
}

describe("architecture boundaries", () => {
  test("root src is absent after the v0.2 workspace cutover", () => {
    expect(existsSync(join(root, "src"))).toBe(false)
  })

  test("core stays independent of storage and web", () => {
    const offenders = filesUnder(join(root, "packages/core/src")).filter((path) =>
      /@qgenda\/(storage|web)/.test(read(path)),
    )
    expect(offenders.map((path) => relative(root, path))).toEqual([])
  })

  test("storage does not import solver, rule, scorecard, or web modules", () => {
    const offenders = filesUnder(join(root, "packages/storage/src")).filter((path) =>
      /@qgenda\/(web|core\/solver|core\/rules|core\/scorecard)/.test(read(path)),
    )
    expect(offenders.map((path) => relative(root, path))).toEqual([])
  })

  test("browser client does not import storage or solver internals", () => {
    const offenders = filesUnder(join(root, "apps/web/src/client")).filter((path) =>
      /@qgenda\/(storage|core\/solver|core\/rules|core\/scorecard)/.test(read(path)),
    )
    expect(offenders.map((path) => relative(root, path))).toEqual([])
  })

  test("MiniZinc artifacts stay inside the core solver adapter", () => {
    const offenders = filesUnder(join(root, "apps"))
      .concat(filesUnder(join(root, "packages/storage/src")))
      .filter((path) => /minizinc|schedule\.mzn/i.test(read(path)))
    expect(offenders.map((path) => relative(root, path))).toEqual([])
  })

  test("workspace packages expose explicit public subpaths", () => {
    for (const packageDir of ["packages/core", "packages/storage", "apps/web"]) {
      expect(Object.keys(packageExports(packageDir))).not.toContain("./*")
    }
  })

  test("TypeScript path aliases do not expose package source wildcards", () => {
    const paths = JSON.parse(read(join(root, "tsconfig.json"))).compilerOptions.paths ?? {}
    expect(Object.keys(paths).filter((key) => key.includes("*"))).toEqual([])
  })

  test("Vite resolves workspace packages through package exports, not source-root aliases", () => {
    const config = read(join(root, "apps/web/vite.config.ts"))
    expect(config.includes("packages/core/src")).toBe(false)
    expect(config.includes("packages/storage/src")).toBe(false)
  })
})
