import { Database } from "bun:sqlite"
import { join } from "node:path"
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./schema"

// Opens the local SQLite database, enables foreign-key enforcement, and applies all committed
// migrations. Pass ":memory:" for an isolated test database. The caller owns the handle for the process
// lifetime. The migrations folder is the generated, committed source of truth (regenerate with
// `bun run db:generate`).
export type Db = BunSQLiteDatabase<typeof schema>

export function openDatabase(path: string): Db {
  const sqlite = new Database(path)
  sqlite.exec("PRAGMA foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: join(import.meta.dir, "migrations") })
  return db
}
