import { drizzle } from "drizzle-orm/bun-sql";

export const db = drizzle({
  cwd: process.cwd(),
});

export type DB = typeof db;
