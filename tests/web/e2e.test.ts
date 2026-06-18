import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { openDatabase } from "@qgenda/storage/db"
import { createApp } from "@qgenda/web/server/http"
import { serveStatic } from "hono/bun"
import { type Browser, chromium, type Page } from "playwright"

const root = join(import.meta.dir, "..", "..")
const distRoot = join(root, "apps/web/dist")

let browser: Browser | null = null
let server: ReturnType<typeof Bun.serve> | null = null

afterEach(async () => {
  await browser?.close()
  browser = null
  server?.stop(true)
  server = null
})

async function openApp(): Promise<Page> {
  if (!existsSync(join(distRoot, "index.html")))
    throw new Error("web dist is missing; run `bun run build` before browser tests")

  const app = createApp(openDatabase(":memory:"))
  app.get("/favicon.ico", () => new Response(null, { status: 204 }))
  app.use("/*", serveStatic({ root: distRoot }))
  app.get("*", serveStatic({ path: join(distRoot, "index.html") }))
  server = Bun.serve({ port: 0, fetch: app.fetch })

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text())
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  await page.goto(`http://localhost:${server.port}`, { waitUntil: "networkidle" })
  await expectNoBrowserErrors(page, browserErrors)
  return page
}

async function expectNoBrowserErrors(page: Page, browserErrors: readonly string[]) {
  const overlayCount = await page
    .locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")
    .count()
  expect(overlayCount, "no framework error overlay").toBe(0)
  expect(browserErrors, "no browser console/page errors").toEqual([])
}

async function addProvider(
  page: Page,
  index: number,
  input: { name: string; eye?: boolean; dental?: boolean },
) {
  await page.getByRole("button", { name: "Add provider" }).click()
  await page.getByLabel(`Provider ${index} display name`).fill(input.name)
  await page.getByLabel(`Provider ${index} call eligible`).check()
  if (input.eye) await page.getByLabel(`Provider ${index} eye eligible`).check()
  if (input.dental) await page.getByLabel(`Provider ${index} dental eligible`).check()
}

async function addTemplate(
  page: Page,
  index: number,
  input: {
    id: string
    weekday: string
    rooms: string
    normal: string
    eye?: string
    dental?: string
    call: boolean
  },
) {
  await page.getByRole("button", { name: "Add template" }).click()
  await page.getByLabel(`Template ${index} ID`).fill(input.id)
  await page.getByLabel(`Template ${index} weekday`).selectOption(input.weekday)
  await page.getByLabel(`Template ${index} rooms`).fill(input.rooms)
  await page.getByLabel(`Template ${index} normal slots`).fill(input.normal)
  await page.getByLabel(`Template ${index} eye slots`).fill(input.eye ?? "0")
  await page.getByLabel(`Template ${index} dental slots`).fill(input.dental ?? "0")
  await page.getByLabel(`Template ${index} call required`).setChecked(input.call)
}

describe("local web app critical path", () => {
  test("creates planning facts through forms, generates a month, reviews it, and exports ICS", async () => {
    const page = await openApp()

    await page.getByText("Recommended horizon").waitFor({ state: "visible" })
    await page.getByText("No providers. Add providers").waitFor({ state: "visible" })
    await page.getByText("No demand templates. Add weekly demand").waitFor({ state: "visible" })

    await page.getByRole("link", { name: "Roster" }).click()
    await addProvider(page, 1, { name: "Dr. Alpha" })
    await addProvider(page, 2, { name: "Dr. Beta" })
    await addProvider(page, 3, { name: "Dr. Gamma" })
    await addProvider(page, 4, { name: "Dr. Delta", eye: true, dental: true })
    await page.getByRole("button", { name: "Add unavailability" }).click()
    await page.getByLabel("Unavailability 1 ID").fill("vac_dr_a")
    await page.getByLabel("Unavailability 1 provider").selectOption("provider_1")
    await page.getByLabel("Unavailability 1 start date").fill("2026-03-10")
    await page.getByLabel("Unavailability 1 end date").fill("2026-03-10")
    await page.getByLabel("Start this cycle with zero opening debt for missing ledger rows").check()
    await page.getByRole("button", { name: "Add ledger entry" }).click()
    await page.getByLabel("Ledger 1 provider").selectOption("provider_1")
    await page.getByLabel("Ledger 1 call burden").fill("1.5")
    await page.getByLabel("Ledger 1 weekend burden").fill("0.5")
    await page.getByLabel("Ledger 1 first count").fill("1")

    await page.getByRole("link", { name: "Demand" }).click()
    await addTemplate(page, 1, { id: "tpl_mon", weekday: "monday", rooms: "1", normal: "1", call: true })
    await addTemplate(page, 2, { id: "tpl_tue", weekday: "tuesday", rooms: "1", normal: "1", call: true })
    await addTemplate(page, 3, {
      id: "tpl_wed",
      weekday: "wednesday",
      rooms: "2",
      normal: "1",
      eye: "1",
      call: true,
    })
    await addTemplate(page, 4, {
      id: "tpl_thu",
      weekday: "thursday",
      rooms: "2",
      normal: "1",
      dental: "1",
      call: true,
    })
    await addTemplate(page, 5, { id: "tpl_fri", weekday: "friday", rooms: "1", normal: "1", call: true })
    await addTemplate(page, 6, { id: "tpl_sat", weekday: "saturday", rooms: "0", normal: "0", call: false })
    await addTemplate(page, 7, { id: "tpl_sun", weekday: "sunday", rooms: "0", normal: "0", call: false })
    await page.getByRole("button", { name: "Add exception" }).click()
    await page.getByLabel("Exception 1 ID").fill("ex_dental_day")
    await page.getByLabel("Exception 1 date").fill("2026-03-12")
    await page.getByLabel("Exception 1 rooms").fill("2")
    await page.getByLabel("Exception 1 normal slots").fill("1")
    await page.getByLabel("Exception 1 dental slots").fill("1")
    await page.getByLabel("Exception 1 call required").check()
    await page.getByLabel("Exception 1 label").fill("Dental clinic day")

    await page.getByRole("link", { name: "Calendar Facts" }).click()
    await page.getByRole("button", { name: "Add weekend block" }).click()
    await page.getByLabel("Weekend block 1 ID").fill("spring_weekend")
    await page.getByLabel("Weekend block 1 label").fill("Spring long weekend")
    await page.getByLabel("Weekend block 1 date 1").fill("2026-03-13")
    await page.getByLabel("Add date to weekend block 1").click()
    await page.getByLabel("Weekend block 1 date 2").fill("2026-03-14")
    await page.getByLabel("Add date to weekend block 1").click()
    await page.getByLabel("Weekend block 1 date 3").fill("2026-03-15")
    await page.getByLabel("Add date to weekend block 1").click()
    await page.getByLabel("Weekend block 1 date 4").fill("2026-03-17")
    await page.getByLabel("Weekend block 1 split required").check()
    await page.getByLabel("Weekend block 1 distinct call providers").fill("2")
    await page.getByRole("button", { name: "Add holiday" }).click()
    await page.getByLabel("Holiday 1 ID").fill("spring_holiday")
    await page.getByLabel("Holiday 1 date").fill("2026-03-17")
    await page.getByLabel("Holiday 1 label").fill("Spring Holiday")
    await page.getByLabel("Holiday 1 weekend block").selectOption("spring_weekend")

    await page.getByRole("button", { name: "Save planning" }).click()
    await page.getByText("Saved").waitFor({ state: "visible" })

    await page.getByRole("link", { name: "Generate" }).click()
    await page.getByLabel("Start").fill("2026-03-01")
    await page.getByLabel("End").fill("2026-03-31")
    await page.getByRole("button", { name: "Compile preview" }).click()
    await page.getByText(/Compiled: 31 days/).waitFor({ state: "visible", timeout: 30_000 })
    await page.getByRole("button", { name: "Generate schedule" }).click()
    await page.waitForURL(/#\/runs\/run_/, { timeout: 60_000 })
    await page.getByRole("heading", { name: "Optimal" }).waitFor({ state: "visible" })
    await page.getByText("No hard-rule violations").waitFor({ state: "visible" })
    await page.getByRole("heading", { name: "Provider by day" }).waitFor({ state: "visible" })
    await page.getByRole("heading", { name: "Opening fairness debt" }).waitFor({ state: "visible" })
    await page.getByRole("heading", { name: "Fairness ledger" }).waitFor({ state: "visible" })
    await page.getByRole("heading", { name: "Fairness targets and deltas" }).waitFor({ state: "visible" })
    expect(await page.getByText("1.50").count(), "opening call debt rendered").toBeGreaterThan(0)

    const icsHref = await page.getByRole("link", { name: "All-provider ICS" }).getAttribute("href")
    expect(icsHref).toMatch(/\/export\/ics$/)
    const ics = await (await page.request.get(new URL(icsHref as string, page.url()).toString())).text()
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).toContain("Call:")

    await page.getByRole("button", { name: "Replay snapshot" }).click()
    await page.getByText(/Replayed as/).waitFor({ state: "visible", timeout: 60_000 })
  }, 120_000)
})
