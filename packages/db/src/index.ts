import { drizzle } from "drizzle-orm/bun-sqlite";

const DEFAULT_DB_FILE = "server.db";

const resolveDatabasePath = (): string => {
  const rawPath = process.env.DB_PATH ?? process.env.DATABASE_URL;
  if (!rawPath) {
    return DEFAULT_DB_FILE;
  }
  if (rawPath.startsWith("file:")) {
    try {
      return new URL(rawPath).pathname;
    } catch {
      // Fallback for malformed URLs
      return rawPath.replace(/^file:\/\/\/?/, "");
    }
  }
  return rawPath;
};

const databasePath = resolveDatabasePath();

export const db = drizzle({
  connection: {
    source: databasePath,
  },
});

export type DB = typeof db;
export const dbPath = databasePath;
