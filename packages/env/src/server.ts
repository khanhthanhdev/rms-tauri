import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { minLength, optional, picklist, pipe, string, url } from "valibot";

const runtimeEnv = {
  ...process.env,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "rms-local-default-secret-please-change-1234567890",
  BETTER_AUTH_URL:
    process.env.BETTER_AUTH_URL ?? "http://127.0.0.1/api/auth",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://127.0.0.1",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:server.db",
};

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: pipe(string(), minLength(32)),
    BETTER_AUTH_URL: pipe(string(), url()),
    CORS_ORIGIN: pipe(string(), url()),
    DATABASE_URL: pipe(string(), minLength(1)),
    NODE_ENV: optional(
      picklist(["development", "production", "test"]),
      "development"
    ),
  },
  emptyStringAsUndefined: true,
  runtimeEnv,
});
